"""Probe the pinned upstream substrate, not the Orvilo adapter or backend."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

PIN = "7d442aafa985f9342134fac16c2ef41f03fb45c1"
root = Path(sys.argv[1]).resolve()
head = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
if head != PIN:
    raise SystemExit(f"Prime revision mismatch: expected {PIN}, observed {head}")
source = root / "prime-agent-runtime/src/rlm/harness.py"
spec = importlib.util.spec_from_file_location("prime_harness_probe", source)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
corpus = json.loads(Path(__file__).with_name("recall-corpus.json").read_text())
started = time.perf_counter()
with tempfile.TemporaryDirectory(prefix="orvilo-prime-eval-") as directory:
    store = Path(directory) / "alice.json"
    first = module.HarnessState(store)
    # Fixture setup selects owner/lifecycle. Upstream has neither tenant ACL nor tombstones.
    for row in corpus["records"]:
        if row["owner"] == "alice" and row["lifecycle"] == "active":
            first.create_memory(row["id"], row["content"], id=row["id"], path="experience")
    second = module.HarnessState(store)
    observations = [
        {"queryId": row["id"], "ids": [entry.id for entry in second.search(row["query"], kind="memory", limit=corpus["topK"])]}
        for row in corpus["queries"]
    ]
    assert second.get("memory", "zh-experience") is not None
    first.update_memory("zh-experience", "zh-experience", "构建失败先检查 Node 版本。")
    assert "Node" in second.get("memory", "zh-experience").content
    first.delete_memory("zh-experience")
    assert second.get("memory", "zh-experience") is None
    assert all(entry.id != "zh-experience" for entry in second.search("构建", kind="memory"))
    reopened = module.HarnessState(store)
    assert reopened.get("memory", "zh-experience") is None
    result = {
        "primeRevision": head,
        "surface": "upstream HarnessState only; Orvilo integration untested",
        "observations": observations,
        "crossInstanceUpdate": True,
        "crossInstanceDelete": True,
        "deleteAfterReopen": True,
        "wallMs": round((time.perf_counter() - started) * 1000, 3),
        "providerCalls": 0,
        "embeddingCalls": 0,
        "tenantIsolation": "not provided by upstream; requires Orvilo boundary",
    }
print(json.dumps(result, ensure_ascii=False, indent=2))
