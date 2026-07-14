from pathlib import Path
from dotenv import load_dotenv
import os

env_path = Path(__file__).resolve().parent.parent / ".env"

print(f"Loading: {env_path}")

load_dotenv(env_path)

print("STAFF_USERNAME =", os.getenv("STAFF_USERNAME"))
print("STAFF_PASSWORD =", os.getenv("STAFF_PASSWORD"))