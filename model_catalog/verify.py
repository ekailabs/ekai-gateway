import json
from jsonschema import Draft202012Validator

# Paths
schema_path = "model_schema_v0.json"  # updated schema with boolean modalities
master_path = "programming_models.json"

# Load schema
with open(schema_path, "r") as f:
    schema = json.load(f)

# Load master file
with open(master_path, "r") as f:
    master = json.load(f)

# Initialize validator
validator = Draft202012Validator(schema)

def validate_entry(model_name, provider_name, entry):
    errors = sorted(validator.iter_errors(entry), key=lambda e: e.path)
    if errors:
        print(f"❌ Validation failed for {model_name} ({provider_name}):")
        for error in errors:
            path = ".".join([str(p) for p in error.path])
            print(f"   - {path}: {error.message}")
    else:
        print(f"✅ {model_name} ({provider_name}) is valid")

# Iterate over all models and providers
for model_name, providers in master.items():
    for provider_name, entry in providers.items():
        validate_entry(model_name, provider_name, entry)
