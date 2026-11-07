import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from test_dispatch_auth import worker

class VideoLimits(unittest.TestCase):
    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg tools unavailable')
    def test_real_short_video_extracts_six_frames(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);video=root/'clip.mp4'
            subprocess.run(['ffmpeg','-nostdin','-v','error','-f','lavfi','-i','color=c=gray:s=1536x1024:r=6',
                            '-t','2','-threads','1','-c:v','mpeg4',str(video)],check=True,timeout=15)
            workspace=root/'work';workspace.mkdir()
            job=worker.DispatchPayload.from_payload({'scanId':'test','uploads':[{'kind':'video','fileName':'clip.mp4','url':'https://test.public.blob.vercel-storage.com/clip.mp4'}]})
            with patch.object(worker,'download_file',side_effect=lambda url,destination,**kwargs: shutil.copyfile(video,destination)):
                result=worker.prepare_workspace(job,workspace)
            frames=[Path(p) for p in result['extracted_frames']]
            self.assertEqual(len(frames),6)
            self.assertTrue(all(p.stat().st_size>0 for p in frames))
            self.assertTrue(Path(result['source_pack_path']).is_file())
            info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=width,height','-of','json',str(frames[0])],timeout=5))
            self.assertLessEqual(max(info['streams'][0]['width'],info['streams'][0]['height']),1024)

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg tools unavailable')
    def test_live_webm_missing_duration_is_recovered_without_truncating(self):
        for seconds in [2,31]:
            with tempfile.TemporaryDirectory() as directory:
                root=Path(directory);video=root/'live.webm'
                subprocess.run(['ffmpeg','-nostdin','-v','error','-f','lavfi','-i','color=c=gray:s=96x64:r=3',
                                '-t',str(seconds),'-threads','1','-c:v','libvpx','-live','1',str(video)],check=True,timeout=15)
                before=video.read_bytes()
                info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(video)],timeout=5))
                self.assertNotIn('duration',info.get('format',{}))
                if seconds==2:
                    self.assertEqual(len(worker.extract_ffmpeg_keyframes(video,root/'frames')),6)
                else:
                    with self.assertRaises(ValueError):worker.extract_ffmpeg_keyframes(video,root/'frames')
                    self.assertFalse((root/'frames').exists())
                self.assertEqual(video.read_bytes(),before)

    def test_invalid_metadata_rejects_before_extraction(self):
        for duration,width,height in [('31',96,64),('nan',96,64),('2',5000,64),('0',96,64),('2',0,64)]:
            with tempfile.TemporaryDirectory() as directory:
                root=Path(directory);video=root/'clip';video.write_bytes(b'x')
                result=subprocess.CompletedProcess([],0,json.dumps({'format':{'duration':duration},'streams':[{'width':width,'height':height}]}).encode())
                with patch.object(worker.subprocess,'run',return_value=result) as run:
                    with self.assertRaises(ValueError):worker.extract_ffmpeg_keyframes(video,root/'frames')
                    self.assertEqual(run.call_count,1)
                    self.assertFalse((root/'frames').exists())

    def test_truncated_normalization_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);video=root/'clip';video.write_bytes(b'x')
            result=subprocess.CompletedProcess([],0,b'{"format":{"duration":"2"},"streams":[{"width":96,"height":64,"nb_read_packets":"5"}]}')
            with patch.object(worker.subprocess,'run',return_value=result) as run:
                with self.assertRaises(ValueError):worker.extract_ffmpeg_keyframes(video,root/'frames',_allow_remux=False,_expected_packets=6)
                self.assertEqual(run.call_count,1)
                self.assertFalse((root/'frames').exists())

    def test_timeout_removes_partial_frames(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);video=root/'clip';video.write_bytes(b'x')
            result=subprocess.CompletedProcess([],0,b'{"format":{"duration":"2"},"streams":[{"width":96,"height":64}]}')
            def execute(command,**kwargs):
                if command[0]=='ffprobe':return result
                (root/'frames/frame-0001.jpg').write_bytes(b'partial')
                raise subprocess.TimeoutExpired(command,45)
            with patch.object(worker.subprocess,'run',side_effect=execute):
                with self.assertRaises(subprocess.TimeoutExpired):worker.extract_ffmpeg_keyframes(video,root/'frames')
                self.assertFalse((root/'frames').exists())

if __name__=='__main__':unittest.main()
