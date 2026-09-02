import unittest

from main import classify_sentence, split_sentences


class BarkCodeTests(unittest.TestCase):
    def test_known_intent(self):
        result = classify_sentence("Please give me some water")
        self.assertEqual(result["intent"], "water")
        self.assertEqual(result["cue"], "WATER")
        self.assertTrue(result["matched"])

    def test_question_fallback(self):
        result = classify_sentence("Where are you?")
        self.assertEqual(result["intent"], "question")
        self.assertFalse(result["matched"])

    def test_sentence_split(self):
        self.assertEqual(split_sentences("Come here. Sit, please!"), ["Come here.", "Sit", "please!"])


if __name__ == "__main__":
    unittest.main()
