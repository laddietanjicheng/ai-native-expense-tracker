import ast
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]

# Each layer may only import from the layers listed after it: app -> core -> config.
FORBIDDEN_IMPORTS = {
    "core": {"app"},
    "config": {"app", "core"},
}


def _imported_top_level_packages(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    packages: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            packages.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            packages.add(node.module.split(".")[0])
    return packages


@pytest.mark.parametrize("layer", sorted(FORBIDDEN_IMPORTS))
def test_layer_does_not_import_higher_layers(layer: str) -> None:
    violations = [
        f"{path.relative_to(BACKEND_ROOT)} imports {package}"
        for path in (BACKEND_ROOT / layer).rglob("*.py")
        for package in _imported_top_level_packages(path) & FORBIDDEN_IMPORTS[layer]
    ]
    assert violations == []
