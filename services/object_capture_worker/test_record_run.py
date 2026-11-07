import unittest
from record_run import summarize

class RunEvidenceTests(unittest.TestCase):
    def events(self):
        return [{'event':'started','timestamp':10,'detail':'medium','masking':'masked'},
                {'event':'completed','timestamp':31.5,'artifact_exists':True}]

    def test_success_keeps_fidelity_unknown(self):
        result=summarize(self.events(),0,True)
        self.assertEqual(result['artifact_success_reward'],1)
        self.assertEqual(result['elapsed_seconds'],21.5)
        self.assertEqual(result['photo_fidelity'],'not_evaluated')
        self.assertFalse(result['automatic_promotion'])

    def test_artifact_alone_is_not_success(self):
        self.assertEqual(summarize([],0,True)['artifact_success_reward'],0)

    def test_failures_override_file_and_completed_marker(self):
        for events,code,exists in [(self.events(),1,True),(self.events(),0,False),
                                  (self.events()+[{'event':'timeout'}],0,True)]:
            self.assertEqual(summarize(events,code,exists)['artifact_success_reward'],0)

    def test_duplicate_run_log_is_not_success(self):
        self.assertEqual(summarize(self.events()*2,0,True)['artifact_success_reward'],0)

    def test_invalid_clock_does_not_manufacture_duration(self):
        for timestamp in [9,float('nan'),None,True]:
            events=self.events();events[1]['timestamp']=timestamp
            self.assertIsNone(summarize(events,0,True)['elapsed_seconds'])

if __name__=='__main__': unittest.main()
