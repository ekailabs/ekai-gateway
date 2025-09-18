import json
import jsonschema
from jsonschema import validate

# Load schema
with open("model_schema_v1.json", "r") as f:
    schema = json.load(f)

# Load data to validate
with open("programming_models_v1.json", "r") as f:
    data = json.load(f)

# Validate entire file
print("Validating entire file...")
try:
    validate(instance=data, schema=schema)
    print("✅ Whole JSON is valid against schema!")
except jsonschema.exceptions.ValidationError as e:
    print("❌ Whole JSON validation error:", e.message)
    print("At path:", list(e.path))

# Validate each model separately with $defs included
print("\nValidating individual models...")
model_schema_template = schema["patternProperties"]["^(?!all_models$)[a-zA-Z0-9._-]+$"]
for model_name in data.get("all_models", []):
    if model_name not in data:
        print(f"⚠️ {model_name} not found as a top-level key")
        continue
    try:
        sub_schema = {
            "$schema": schema["$schema"],
            **model_schema_template,
            "$defs": schema["$defs"]
        }
        validate(instance=data[model_name], schema=sub_schema)
        print(f"✅ {model_name} is valid")
    except jsonschema.exceptions.ValidationError as e:
        print(f"❌ {model_name} failed validation: {e.message}")
        print("At path:", list(e.path))
