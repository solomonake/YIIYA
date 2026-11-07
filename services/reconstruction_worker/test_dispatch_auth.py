"""Real HTTP routing tests; Modal provisioning and GPU execution are mocked."""
import importlib
import os
import sys
import types
import unittest
from unittest.mock import Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient


class ImageStub:
    @classmethod
    def debian_slim(cls, **kwargs): return cls()
    def apt_install(self, *args, **kwargs): return self
    def pip_install(self, *args, **kwargs): return self
    def pip_install_from_requirements(self, *args, **kwargs): return self


class AppStub:
    def __init__(self, *args): pass
    def function(self, **kwargs): return lambda function: function
    def local_entrypoint(self): return lambda function: function


modal_stub = types.SimpleNamespace(Image=ImageStub, App=AppStub,
    Secret=types.SimpleNamespace(from_name=lambda name: None),
    fastapi_endpoint=lambda **kwargs: lambda function: function)
with patch.dict(sys.modules, {'modal': modal_stub}):
    worker = importlib.import_module('modal_app')
    server = importlib.import_module('server')

PAYLOAD = {'scanId':'test','uploads':[{'kind':'keyframe','fileName':'frame.png','url':'https://test.public.blob.vercel-storage.com/frame.png'}]}

modal_http = FastAPI()
modal_http.post('/dispatch')(worker.dispatch)


class DispatchAuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'SCAN_RECONSTRUCTION_API_KEY':'test-only-shared-key'})
        self.env.start()
        self.spawn = Mock(return_value=types.SimpleNamespace(object_id='test-call'))
        self.spawn_patch = patch.object(worker.reconstruct_job, 'spawn', self.spawn, create=True)
        self.spawn_patch.start()
        self.pipeline_patch = patch.object(server, 'run_worker_pipeline')
        self.pipeline = self.pipeline_patch.start()

    def tearDown(self):
        self.pipeline_patch.stop(); self.spawn_patch.stop(); self.env.stop()

    def clients(self):
        return [(TestClient(modal_http), '/dispatch'), (TestClient(server.app), '/reconstruct')]

    def test_missing_configuration_fails_closed(self):
        for secret in ['', '   ', 'x'*1025]:
            with patch.dict(os.environ, {'SCAN_RECONSTRUCTION_API_KEY':secret}):
                for client, path in self.clients():
                    response=client.post(path, json=PAYLOAD)
                    self.assertEqual(response.status_code,503)
        self.spawn.assert_not_called(); self.pipeline.assert_not_called()

    def test_wrong_missing_malformed_and_duplicate_headers_never_enqueue(self):
        headers=[{}, {'Authorization':'Bearer wrong'}, {'Authorization':'test-only-shared-key'},
                 {'Authorization':'Bearer test-only-shared-key '}, {'Authorization':'x'*2049},
                 [('Authorization','Bearer test-only-shared-key'),('Authorization','Bearer wrong')]]
        for header in headers:
            for client,path in self.clients():
                response=client.post(path,json=PAYLOAD,headers=header)
                self.assertEqual(response.status_code,401)
                self.assertNotIn('test-only-shared-key', response.text)
        self.spawn.assert_not_called(); self.pipeline.assert_not_called()

    def test_authorized_modal_request_enqueues_once(self):
        response=TestClient(modal_http).post('/dispatch',json=PAYLOAD,headers={'Authorization':'Bearer test-only-shared-key'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['callId'],'test-call')
        self.spawn.assert_called_once_with(PAYLOAD)

    def test_authorized_container_request_enqueues_once(self):
        response=TestClient(server.app).post('/reconstruct',json=PAYLOAD,headers={'Authorization':'Bearer test-only-shared-key'})
        self.assertEqual(response.status_code,200)
        self.pipeline.assert_called_once()
        self.assertEqual(self.pipeline.call_args.args[0].scan_id,'test')

    def test_unauthorized_invalid_json_is_rejected_before_parse(self):
        for client,path in self.clients():
            self.assertEqual(client.post(path,content=b"not json").status_code,401)
        self.spawn.assert_not_called();self.pipeline.assert_not_called()

    def test_bounded_chunked_body_before_enqueue(self):
        for client,path in self.clients():
            response=client.post(path,content=iter([b" "*131072,b" "*131073]),headers={'Authorization':'Bearer test-only-shared-key'})
            self.assertEqual(response.status_code,413)
        self.spawn.assert_not_called();self.pipeline.assert_not_called()

    def test_invalid_uploads_and_paths_never_enqueue(self):
        import copy
        cases=[]
        for source in ['http://localhost/x','https://127.0.0.1/x','https://169.254.169.254/x',
                       'https://test.public.blob.vercel-storage.com.evil.test/x',
                       'https://user:pass@test.public.blob.vercel-storage.com/x',
                       'https://test.public.blob.vercel-storage.com:444/x',
                       'https://test.public.blob.vercel-storage.com/x#token',
                       'https://test.fal.media/x']:
            item=copy.deepcopy(PAYLOAD);item['uploads'][0]['url']=source;cases.append(item)
        for name in ['../escape','/tmp/escape','..','a/b','a\\b','x'*161]:
            item=copy.deepcopy(PAYLOAD);item['uploads'][0]['fileName']=name;cases.append(item)
        for uploads in [[],PAYLOAD['uploads']*13,PAYLOAD['uploads']*2]:
            cases.append(dict(PAYLOAD,uploads=uploads))
        cases.extend([dict(PAYLOAD,scanId='../escape'),dict(PAYLOAD,promptHint=[]),dict(PAYLOAD,warnings='bad')])
        for payload in cases:
            for client,path in self.clients():
                response=client.post(path,json=payload,headers={'Authorization':'Bearer test-only-shared-key'})
                self.assertEqual(response.status_code,422,str(payload))
        self.spawn.assert_not_called();self.pipeline.assert_not_called()

    def test_health_does_not_allocate_work(self):
        with patch.dict(os.environ, {'SCAN_RECONSTRUCTION_API_KEY':''}):
            self.assertEqual(TestClient(server.app).get('/health').status_code,200)
        self.spawn.assert_not_called();self.pipeline.assert_not_called()


if __name__=='__main__': unittest.main()
