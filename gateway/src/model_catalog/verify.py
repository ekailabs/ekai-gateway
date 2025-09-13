import json
import jsonschema
from jsonschema import validate

# Load the schema
with open("model_schema_v0.json", "r") as f:
    schema = json.load(f)

# Load filled JSON template
with open("models/gpt5.json", "r") as f:
    data = json.load(f)

try:
    validate(instance=data, schema=schema)
    print("JSON is valid!")
except jsonschema.exceptions.ValidationError as e:
    print("JSON is invalid!")
    print("Error:", e.message)
    print("Path:", list(e.path))
