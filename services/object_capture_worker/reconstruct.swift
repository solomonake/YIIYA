import Foundation
import RealityKit
import Darwin

func emit(_ value: [String: Any]) {
    var record = value
    record["timestamp"] = Date().timeIntervalSince1970
    if let data = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]) {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([10]))
    }
}

@main
struct Reconstruct {
    static func main() async {
        let args = CommandLine.arguments
        guard (5...7).contains(args.count), ["normal", "high"].contains(args[3]), ["masked", "unmasked"].contains(args[4]) else {
            emit(["event": "error", "message": "Usage: reconstruct INPUT_DIR NEW_OUTPUT_DIR normal|high masked|unmasked [reduced|medium] [poses|geometry-check|entity-check|cloud-check|detail-check]"])
            exit(2)
        }
        let detailName = args.count >= 6 ? args[5] : "reduced"
        guard ["reduced", "medium"].contains(detailName) else {
            emit(["event": "error", "message": "Detail must be reduced or medium"])
            exit(2)
        }
        let includePoses = args.count == 7
        let geometryCheck = includePoses && args[6] == "geometry-check"
        let entityCheck = includePoses && args[6] == "entity-check"
        let cloudCheck = includePoses && args[6] == "cloud-check"
        let detailCheck = includePoses && args[6] == "detail-check"
        if detailCheck && detailName != "reduced" {
            emit(["event": "error", "message": "detail-check requires reduced baseline"]); exit(2)
        }
        if includePoses && !["poses", "geometry-check", "entity-check", "cloud-check", "detail-check"].contains(args[6]) {
            emit(["event": "error", "message": "Optional final argument must be poses, geometry-check, entity-check, cloud-check or detail-check"])
            exit(2)
        }
        let detail: PhotogrammetrySession.Request.Detail = detailName == "medium" ? .medium : .reduced
        guard PhotogrammetrySession.isSupported else {
            emit(["event": "error", "message": "Object Capture is unavailable in this execution environment"])
            exit(2)
        }
        let input = URL(fileURLWithPath: args[1], isDirectory: true)
        let outputDir = URL(fileURLWithPath: args[2], isDirectory: true)
        do {
            let files = try FileManager.default.contentsOfDirectory(at: input, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey])
                .filter { ["png", "jpg", "jpeg", "heic"].contains($0.pathExtension.lowercased()) }
            var total = 0
            for file in files {
                let values = try file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                guard values.isRegularFile == true else { throw NSError(domain: "Input", code: 1) }
                total += values.fileSize ?? 0
            }
            guard (10...100).contains(files.count), total <= 100_000_000,
                  !FileManager.default.fileExists(atPath: outputDir.path) else {
                emit(["event": "error", "message": "Need 10–100 images <=100MB and a new output directory"])
                exit(2)
            }
            try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
            var config = PhotogrammetrySession.Configuration()
            config.sampleOrdering = .unordered
            config.featureSensitivity = args[3] == "high" ? .high : .normal
            config.isObjectMaskingEnabled = args[4] == "masked"
            let session = try PhotogrammetrySession(input: input, configuration: config)
            let output = outputDir.appendingPathComponent("model.usdz")
            emit(["event": "started", "input_count": files.count, "input_bytes": total,
                  "poses_requested": includePoses, "geometry_check": geometryCheck, "entity_check": entityCheck, "detail": detailName, "sensitivity": args[3], "masking": args[4], "timeout_seconds": 300])
            let watchdog = Task {
                do { try await Task.sleep(nanoseconds: 300_000_000_000) }
                catch { return }
                emit(["event": "timeout"])
                session.cancel()
            }
            defer { watchdog.cancel() }
            var requests: [PhotogrammetrySession.Request] = [.modelFile(url: output, detail: detail)]
            let nativeOutput = outputDir.appendingPathComponent("model-native.usdz")
            let mediumOutput = outputDir.appendingPathComponent("model-medium.usdz")
            if detailCheck { requests.append(.modelFile(url: mediumOutput, detail: .medium)) }
            if geometryCheck {
                requests.append(.modelFile(url: nativeOutput, detail: detail, geometry: .init()))
            }
            if entityCheck { requests.append(.modelEntity(detail: detail)) }
            if cloudCheck { requests.append(.pointCloud) }
            if includePoses { requests.append(contentsOf: [.poses, .bounds]) }
            try session.process(requests: requests)
            var completed = false
            var posesWritten = false
            var boundsWritten = false
            var entityWritten = false
            var cloudWritten = false
            for try await event in session.outputs {
                switch event {
                case .requestProgress(_, let fraction): emit(["event": "progress", "fraction": fraction])
                case .inputComplete: emit(["event": "input_complete"])
                case .invalidSample(let id, let reason): emit(["event": "invalid_sample", "id": id, "reason": reason])
                case .skippedSample(let id): emit(["event": "skipped_sample", "id": id])
                case .automaticDownsampling: emit(["event": "automatic_downsampling"])
                case .requestError(_, let error):
                    emit(["event": "request_error", "message": String(describing: error)])
                    session.cancel()
                    exit(1)
                case .requestComplete(_, let result):
                    switch result {
                    case .modelFile(_):
                        completed = FileManager.default.fileExists(atPath: output.path)
                        emit(["event": "request_complete", "artifact_exists": completed])
                    case .modelEntity(let entity):
                        var records: [[String: Any]] = []
                        func vector(_ v: SIMD3<Float>) -> [Float] { [v.x, v.y, v.z] }
                        func inspect(_ current: Entity, path: String) {
                            let m = current.transformMatrix(relativeTo: nil)
                            let local = current.visualBounds(relativeTo: current)
                            let world = current.visualBounds(relativeTo: nil)
                            records.append([
                                "path": path, "name": current.name,
                                "world_matrix_columns": (0..<4).map { [m[$0].x,m[$0].y,m[$0].z,m[$0].w] },
                                "local_visual_bounds": ["min": vector(local.min), "max": vector(local.max)],
                                "world_visual_bounds": ["min": vector(world.min), "max": vector(world.max)]
                            ])
                            for (index, child) in current.children.enumerated() {
                                inspect(child, path: path + "/" + String(index))
                            }
                        }
                        inspect(entity, path: "root")
                        let data = try JSONSerialization.data(withJSONObject: [
                            "schema_version": 1, "entities": records,
                            "limitation": "Entity transforms and bounds only; pose correspondence not established"
                        ], options: [.prettyPrinted, .sortedKeys])
                        try data.write(to: outputDir.appendingPathComponent("model-entity.json"), options: .atomic)
                        entityWritten = !records.isEmpty
                        emit(["event": "entity_written", "count": records.count])
                    case .pointCloud(let cloud):
                        guard !cloud.points.isEmpty, cloud.points.count <= 2_000_000 else {
                            throw NSError(domain: "InvalidPointCloud", code: 1)
                        }
                        let points = cloud.points.map { [$0.position.x, $0.position.y, $0.position.z] }
                        let data = try JSONSerialization.data(withJSONObject: [
                            "schema_version": 1, "positions": points,
                            "limitation": "Sparse native points may include background; no fitted transform"
                        ], options: [.sortedKeys])
                        try data.write(to: outputDir.appendingPathComponent("point-cloud.json"), options: .atomic)
                        cloudWritten = true
                        emit(["event": "point_cloud_written", "count": points.count])
                    case .bounds(let bounds):
                        let low = bounds.min
                        let high = bounds.max
                        let data = try JSONSerialization.data(withJSONObject: [
                            "coordinate_system": "RealityKit estimated frame, shared with poses",
                            "min": [low.x, low.y, low.z], "max": [high.x, high.y, high.z]
                        ], options: [.prettyPrinted, .sortedKeys])
                        try data.write(to: outputDir.appendingPathComponent("native-bounds.json"), options: .atomic)
                        boundsWritten = true
                        emit(["event": "bounds_written"])
                    case .poses(let poses):
                        var records: [[String: Any]] = []
                        for sampleId in poses.posesBySample.keys.sorted() {
                            guard let pose = poses.posesBySample[sampleId] else { continue }
                            let t = pose.translation
                            let q = pose.rotation.vector
                            var record: [String: Any] = ["sample_id": sampleId,
                                "source_file": poses.urlsBySample[sampleId]?.lastPathComponent ?? "",
                                "translation": [t.x, t.y, t.z],
                                "quaternion_xyzw": [q.x, q.y, q.z, q.w]]
                            if #available(macOS 26.0, *) {
                                if let k = pose.intrinsics {
                                    record["intrinsics_columns"] = (0..<3).map { [k[$0].x, k[$0].y, k[$0].z] }
                                }
                                record["lens_distortion_available"] = pose.lensDistortionData != nil
                                if let distortion = pose.lensDistortionData {
                                    record["lens_distortion"] = [
                                        "center": [distortion.center.x, distortion.center.y],
                                        "radial_lookup_table": distortion.radialLookupTable
                                    ]
                                }
                            }
                            records.append(record)
                        }
                        let data = try JSONSerialization.data(withJSONObject: [
                            "schema_version": 1, "coordinate_system": "RealityKit native; registration not yet verified",
                            "poses": records], options: [.prettyPrinted, .sortedKeys])
                        try data.write(to: outputDir.appendingPathComponent("camera-poses.json"), options: .atomic)
                        posesWritten = !records.isEmpty
                        emit(["event": "poses_written", "count": records.count,
                              "mapped_source_count": records.filter { ($0["source_file"] as? String) != "" }.count])
                    default: break
                    }
                case .processingComplete:
                    let nativeExists = !geometryCheck || FileManager.default.fileExists(atPath: nativeOutput.path)
                    let mediumExists = !detailCheck || FileManager.default.fileExists(atPath: mediumOutput.path)
                    let success = completed && mediumExists && nativeExists && (!cloudCheck || cloudWritten) && (!entityCheck || entityWritten) && (!includePoses || (posesWritten && boundsWritten))
                    emit(["event": "completed", "artifact_exists": completed, "poses_written": posesWritten, "bounds_written": boundsWritten, "native_export_complete": nativeExists, "entity_written": entityWritten, "cloud_written": cloudWritten, "medium_export_complete": mediumExists])
                    exit(success ? 0 : 1)
                case .processingCancelled:
                    emit(["event": "cancelled"])
                    exit(1)
                default: break
                }
            }
            emit(["event": "error", "message": "Output stream ended without completion"])
        } catch {
            emit(["event": "error", "message": String(describing: error)])
        }
        exit(1)
    }
}
