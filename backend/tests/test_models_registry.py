import subprocess
import sys


def test_app_configures_all_mappers_on_its_own() -> None:
    code = "import app.main; from sqlalchemy.orm import configure_mappers; configure_mappers()"
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
