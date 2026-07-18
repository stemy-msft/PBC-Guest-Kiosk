import os
from dotenv import load_dotenv

load_dotenv()

DEFAULT_ADMIN_USERNAME = os.getenv(
    "PBC_DEFAULT_ADMIN_USERNAME",
    "admin"
)

DEFAULT_ADMIN_PASSWORD = os.getenv(
    "PBC_DEFAULT_ADMIN_PASSWORD",
    "ChangeMeNow!"
)

DEFAULT_ADMIN_DISPLAY_NAME = os.getenv(
    "PBC_DEFAULT_ADMIN_DISPLAY_NAME",
    "Administrator"
)