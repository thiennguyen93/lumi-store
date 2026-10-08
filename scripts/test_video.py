"""`[extension] video`: the YouTube link an author writes, read down to the
id the index carries, and the picture published beside it.

  python3 -m unittest discover -s scripts -p 'test_*.py'
"""

import io
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish  # noqa: E402

ID = "3xeg8odiBO8"


def read(link):
    return publish.video_of("dev.you.thing", {"video": link})


def refusal(link) -> str:
    with unittest.TestCase().assertRaises(SystemExit) as caught:
        read(link)
    return str(caught.exception.code)


class VideoLink(unittest.TestCase):
    def test_no_key_is_no_video(self):
        self.assertIsNone(publish.video_of("dev.you.thing", {}))

    def test_every_link_youtube_hands_out_reads_as_its_id(self):
        for link in [
            f"https://youtu.be/{ID}",
            f"https://youtu.be/{ID}?si=AbCdEf123",
            f"https://youtu.be/{ID}?t=42",
            f"https://www.youtube.com/watch?v={ID}",
            f"https://www.youtube.com/watch?v={ID}&t=42s",
            f"https://youtube.com/watch?feature=share&v={ID}",
            f"https://m.youtube.com/watch?v={ID}",
            f"https://www.youtube.com/embed/{ID}",
            f"  https://youtu.be/{ID}  ",
        ]:
            with self.subTest(link=link):
                self.assertEqual(read(link), ID)

    def test_anything_but_one_video_is_refused_by_name(self):
        for link in [
            "",
            "   ",
            42,
            [f"https://youtu.be/{ID}"],
            f"http://youtu.be/{ID}",
            f"https://youtu.be.evil.example/{ID}",
            f"https://evil.example/watch?v={ID}",
            f"https://vimeo.com/{ID}",
            "https://www.youtube.com/@thiennguyendev",
            "https://www.youtube.com/playlist?list=PL0123456789",
            f"https://www.youtube.com/shorts/{ID}",
            "https://youtu.be/short",
            f"https://youtu.be/{ID}x",
            f"https://youtu.be/{ID}/",
            "https://youtu.be/../../a?b=c",
            "https://www.youtube.com/watch?v=<script>x",
        ]:
            with self.subTest(link=link):
                self.assertIn("one YouTube video", refusal(link))


class Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def answers(by_size: dict):
    """A stand-in for `urlopen`: the bytes for a size, or the status a
    size answers with, and every URL it was asked for."""
    asked = []

    def urlopen(url, timeout):
        asked.append(url)
        size = url.rsplit("/", 1)[1].removesuffix(".jpg")
        got = by_size.get(size, 404)
        if isinstance(got, int):
            raise urllib.error.HTTPError(url, got, "status", {}, io.BytesIO())
        return Response(got)

    return urlopen, asked


JPEG = b"\xff\xd8\xff\xe0 a picture"


class VideoPoster(unittest.TestCase):
    def poster(self, by_size: dict):
        urlopen, asked = answers(by_size)
        with mock.patch.object(publish.urllib.request, "urlopen", urlopen):
            return publish.video_poster("dev.you.thing", ID), asked

    def refused(self, by_size: dict) -> str:
        with self.assertRaises(SystemExit) as caught:
            self.poster(by_size)
        return str(caught.exception.code)

    def test_the_largest_picture_youtube_has_is_taken(self):
        data, asked = self.poster({"maxresdefault": JPEG, "hqdefault": b"\xff\xd8\xffsmall"})
        self.assertEqual(data, JPEG)
        self.assertEqual(asked, [f"https://i.ytimg.com/vi/{ID}/maxresdefault.jpg"])

    def test_a_video_without_hd_falls_back_in_order(self):
        data, asked = self.poster({"hqdefault": JPEG})
        self.assertEqual(data, JPEG)
        self.assertEqual([url.rsplit("/", 1)[1] for url in asked], ["maxresdefault.jpg", "sddefault.jpg", "hqdefault.jpg"])

    def test_a_video_that_is_not_there_fails_the_run(self):
        self.assertIn(f"no video {ID}", self.refused({}))

    def test_a_failing_youtube_is_not_read_as_a_missing_video(self):
        self.assertIn("answered 503", self.refused({"maxresdefault": 503, "hqdefault": JPEG}))

    def test_what_comes_back_is_held_to_a_screenshot(self):
        self.assertIn("not a JPEG", self.refused({"maxresdefault": b"<html>"}))
        huge = b"\xff\xd8\xff" + b"0" * publish.MAX_SCREENSHOT
        self.assertIn("over", self.refused({"maxresdefault": huge}))


if __name__ == "__main__":
    unittest.main()
