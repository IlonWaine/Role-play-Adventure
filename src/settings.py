from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
DATABASE_URL = Path(ROOT / Path(os.getenv("DATABASE_URL")))


