"""2Captcha API v2 adapter; the only recognition step in the ingestion pipeline.

Docs: https://2captcha.com/api-docs/normal-captcha
      https://2captcha.com/api-docs/get-task-result
"""

import base64
import io
from PIL import Image
import json
import os
import subprocess
import time


class SolverError(RuntimeError):
    pass


class TwoCaptcha:
    def __init__(self, key=None, timeout=180, max_tasks=500):
        self.key = key or os.environ.get("TWOCAPTCHA_API_KEY", "")
        if not self.key:
            raise SolverError("Set TWOCAPTCHA_API_KEY or choose --solver manual.")
        self.timeout, self.max_tasks, self.tasks = timeout, max_tasks, 0
        self.metrics = {
            "ready": 0,
            "accepted": 0,
            "rejected": 0,
            "cost_usd": 0.0,
            "solve_seconds": 0.0,
            "task_ids": [],
        }

    def record_submission(self, accepted):
        self.metrics["accepted" if accepted else "rejected"] += 1

    def call(self, method, fields):
        # Send key via stdin, never argv, output CSV, or logs. Do not retry task
        # creation after an ambiguous network failure (could bill twice).
        response = subprocess.run(
            [
                "curl",
                "--silent",
                "--show-error",
                "--fail",
                "--max-time",
                "30",
                "--header",
                "Content-Type: application/json",
                "--data-binary",
                "@-",
                "https://api.2captcha.com/" + method,
            ],
            input=json.dumps({"clientKey": self.key, **fields}).encode(),
            capture_output=True,
        )
        if response.returncode:
            raise SolverError(f"2Captcha {method} HTTP failure; task not resubmitted.")
        try:
            result = json.loads(response.stdout)
        except ValueError as exc:
            raise SolverError("2Captcha returned invalid JSON.") from exc
        if result.get("errorId"):
            raise SolverError(
                "2Captcha: " + str(result.get("errorCode", "unknown error"))
            )
        return result

    def __call__(self, image_bytes):
        if self.tasks >= self.max_tasks:
            raise SolverError("CAPTCHA task limit reached; checkpoint retained.")
        self.tasks += 1
        started = time.monotonic()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        if image.width * image.height > 1000000:
            raise SolverError("CAPTCHA image is too large.")
        background = Image.new("RGBA", image.size, "white")
        background.alpha_composite(image)
        background = background.convert("RGB")
        scale = min(600 / background.width, 200 / background.height)
        background = background.resize(
            (
                max(1, round(background.width * scale)),
                max(1, round(background.height * scale)),
            )
        )
        encoded = io.BytesIO()
        background.save(encoded, format="PNG")
        image_bytes = encoded.getvalue()
        created = self.call(
            "createTask",
            {
                "languagePool": "en",
                "task": {
                    "type": "ImageToTextTask",
                    "body": base64.b64encode(image_bytes).decode(),
                    "case": True,
                    "minLength": 6,
                    "maxLength": 6,
                    "comment": "CASE SENSITIVE: preserve uppercase and lowercase. Six characters.",
                },
            },
        )
        if not created.get("taskId"):
            raise SolverError("2Captcha did not return a task ID.")
        self.metrics["task_ids"].append(created["taskId"])
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            time.sleep(5)
            result = self.call("getTaskResult", {"taskId": created["taskId"]})
            if result.get("status") == "ready":
                text = result.get("solution", {}).get("text", "").strip()
                if len(text) != 6:
                    raise SolverError("2Captcha returned an unexpected answer length.")
                self.metrics["ready"] += 1
                self.metrics["solve_seconds"] += round(time.monotonic() - started, 3)
                self.metrics["cost_usd"] += float(result.get("cost", 0))
                return text
            if result.get("status") != "processing":
                raise SolverError("2Captcha returned an unknown task status.")
        raise SolverError("2Captcha timed out; task not resubmitted.")
