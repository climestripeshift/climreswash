import time
import unittest
from support import ROOT  # noqa: F401
from bhoomi_ai.llm.deadline import deadline, remaining_timeout
from bhoomi_ai.llm.base import LLMError


class DeadlineTests(unittest.TestCase):
    def test_scoped_remaining_time_and_expired_turn_deny_calls(self):
        self.assertEqual(remaining_timeout(240), 240)
        token = deadline.set(time.time() + 1)
        try:
            self.assertLessEqual(remaining_timeout(240), 1)
            self.assertGreater(remaining_timeout(240), 0)
            deadline.set(time.time() - 1)
            with self.assertRaises(LLMError):
                remaining_timeout(240)
        finally:
            deadline.reset(token)
        self.assertEqual(remaining_timeout(240), 240)
