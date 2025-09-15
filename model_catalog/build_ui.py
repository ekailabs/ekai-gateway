#!/usr/bin/env python3
import json
from pathlib import Path
from datetime import datetime, timezone


def load_models(models_dir: Path):
    models = []
    for p in sorted(models_dir.glob('*.json')):
        try:
            with p.open('r', encoding='utf-8') as f:
                obj = json.load(f)
            provider = obj.get('provider') or 'unknown'
            model_name = obj.get('model_name') or p.stem
            obj['id'] = f"{provider}/{model_name}"
            obj['__filename'] = p.name
            models.append(obj)
        except Exception as e:
            print(f"[warn] Skipping {p.name}: {e}")
    return models


def write_bundle(ui_dir: Path, models):
    ui_dir.mkdir(parents=True, exist_ok=True)
    bundle_path = ui_dir / 'models.bundle.json'
    bundle = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'models': models,
    }
    with bundle_path.open('w', encoding='utf-8') as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)
    print(f"[ok] Wrote {bundle_path.relative_to(Path.cwd())} with {len(models)} models")


def main():
    base = Path(__file__).parent
    models_dir = base / 'models'
    ui_dir = base / 'ui'

    if not models_dir.exists():
        raise SystemExit(f"Models directory not found: {models_dir}")

    models = load_models(models_dir)
    write_bundle(ui_dir, models)


if __name__ == '__main__':
    main()

