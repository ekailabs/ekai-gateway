import json
from pathlib import Path

import jsonschema
from jsonschema import validate


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    schema_path = base_dir / "model_schema_v0.json"
    models_dir = base_dir / "models"

    with open(schema_path, "r") as f:
        schema = json.load(f)

    for model_file in sorted(models_dir.glob("*.json")):
        try:
            with open(model_file, "r") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            # Invalid JSON structure
            print(f"{model_file.name}: invalid JSON - {e.msg} at line {e.lineno} column {e.colno}")
            continue
        except Exception as e:
            # Other file read errors
            print(f"{model_file.name}: unreadable - {e}")
            continue

        try:
            validate(instance=data, schema=schema)
            print(f"{model_file.name} follows schema.")
        except jsonschema.exceptions.ValidationError as e:
            # Invalid against schema; print filename and issue
            path = "/".join(str(p) for p in e.path) or "<root>"
            print(f"{model_file.name}: {e.message} [path: {path}]")


if __name__ == "__main__":
    main()
