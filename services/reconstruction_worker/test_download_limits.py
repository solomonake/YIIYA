import tempfile
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
from test_dispatch_auth import worker

URL='https://test.public.blob.vercel-storage.com/photo.png'

class DownloadLimits(unittest.TestCase):
    def response(self,chunks,status=200,headers=None):
        result=Mock(status_code=status,headers=headers or {})
        result.__enter__=Mock(return_value=result);result.__exit__=Mock(return_value=False)
        result.iter_content.return_value=iter(chunks)
        return result

    def test_disallowed_source_makes_no_request(self):
        with patch.object(worker.requests,'get') as get:
            with self.assertRaises(ValueError):worker.download_file('https://localhost/x',Path('/tmp/unused'))
            get.assert_not_called()

    def test_redirect_and_declared_oversize_do_not_write(self):
        for response in [self.response([],302),self.response([],headers={'Content-Length':str(4*1024*1024)})]:
            with tempfile.TemporaryDirectory() as directory,patch.object(worker.requests,'get',return_value=response):
                destination=Path(directory)/'input'
                with self.assertRaises(ValueError):worker.download_file(URL,destination,upload_only=True)
                self.assertFalse(destination.exists())

    def test_streaming_limit_cleans_partial_file(self):
        response=self.response([b'x'*(1024*1024)]*4)
        with tempfile.TemporaryDirectory() as directory,patch.object(worker.requests,'get',return_value=response):
            destination=Path(directory)/'input'
            with self.assertRaises(ValueError):worker.download_file(URL,destination,upload_only=True)
            self.assertFalse(destination.exists())

    def test_existing_file_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(worker.requests,'get',return_value=self.response([b'new'])):
            destination=Path(directory)/'input';destination.write_bytes(b'old')
            with self.assertRaises(FileExistsError):worker.download_file(URL,destination,upload_only=True)
            self.assertEqual(destination.read_bytes(),b'old')

    def test_valid_download_is_bounded_and_no_redirect(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(worker.requests,'get',return_value=self.response([b'asset'])) as get:
            destination=Path(directory)/'input';worker.download_file(URL,destination,upload_only=True)
            self.assertEqual(destination.read_bytes(),b'asset')
            self.assertFalse(get.call_args.kwargs['allow_redirects'])

if __name__=='__main__': unittest.main()
