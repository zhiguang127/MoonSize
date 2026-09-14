#!/usr/bin/env python3
"""Fetch pinned public projects; build, measure and verify the v0.2 case studies.

Writes only .local/real-cases and reports/cases. Requires Python 3.10+, Node 24,
and the compiler pinned in scripts/setup-ci.sh on PATH. No upstream publication.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import zipfile
import difflib

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.local' / 'real-cases'
OUT = ROOT / 'reports' / 'cases'
PINS = [
    dict(name='cmark', repo='moonbit-community/cmark', commit='ebf47ab9efcbd2ecff6f6ec8656c06a308395729', sha256='cd7ed35b42e6166f2021af0a3ce37ce512748162aa5af991075a030de41e5e5e'),
    dict(name='toml', repo='moonbit-community/toml-parser', commit='52fb664d435013b43897536e05adf5478cc26046', sha256='0aa3cc78b87114fe4a03e29037e094fa66e148fac4d33e614cd70f69980f81d0'),
]
WORK.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
commands = []

def run(args, cwd=ROOT, label='build'):
    commands.append(dict(command=args, cwd=str(cwd.relative_to(ROOT)).replace('\\', '/'), label=label))
    log = OUT / (label + '.log')
    with log.open('w', encoding='utf-8') as stream:
        result = subprocess.run(args, cwd=cwd, stdout=stream, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError(f'{label} failed ({result.returncode}); see {log}')
    print(f'{label}: PASS', flush=True)

def fetch(pin):
    archive = WORK / (pin['name'] + '.zip')
    if not archive.exists():
        url = f"https://codeload.github.com/{pin['repo']}/zip/{pin['commit']}"
        with urllib.request.urlopen(url, timeout=60) as response:
            archive.write_bytes(response.read())
    if hashlib.sha256(archive.read_bytes()).hexdigest() != pin['sha256']:
        raise RuntimeError(f'Archive hash mismatch: {archive}')
    dest = WORK / 'upstream' / pin['name']
    # Refresh only known archive files in this dedicated generated workspace.
    with zipfile.ZipFile(archive) as z:
        prefix = z.namelist()[0].split('/')[0] + '/'
        for member in z.infolist():
            rel = member.filename.removeprefix(prefix)
            if not rel or member.is_dir():
                continue
            target = (dest / rel).resolve()
            if not target.is_relative_to(dest.resolve()):
                raise RuntimeError('Unsafe archive path')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(member))
    for license_file in ('LICENSE', 'LICENSE.md', 'LICENSE.txt'):
        if (dest / license_file).exists():
            shutil.copy2(dest / license_file, OUT / (pin['name'] + '-LICENSE.txt'))
            break
    return dest

cmark, toml = [fetch(pin) for pin in PINS]
(WORK / 'moon.work').write_text('members = ["upstream/cmark", "upstream/cmark/cmarkwrap", "upstream/toml", "upstream/toml/lexer", "upstream/toml/toml_cli", "upstream/toml/e2e"]\n', encoding='utf-8')
# Windows Store's python3 execution alias is not an interpreter. This host-only
# launcher adjustment applies equally to the baseline and optimized builds.
pkg = cmark / 'src' / 'char' / 'moon.pkg'
if os.name == 'nt':
    pkg.write_text(pkg.read_text(encoding='utf-8').replace('python3 $input', 'python $input'), encoding='utf-8')
generator = cmark / 'src' / 'char' / 'gen_entities.py'
lookup = cmark / 'src' / 'char' / 'html.mbt'
originals = {p: p.read_text(encoding='utf-8') for p in (generator, lookup, cmark / 'src/char/entities.mbt')}

def build_cmark(stage):
    for target, suffix in [('wasm-gc', 'wasm'), ('js', 'js')]:
        run(['moon', 'build', 'upstream/cmark/cmarkwrap/src/lib', '--target', target, '--release', '--no-strip'], WORK, f'cmark-{stage}-{target}')
        artifact = WORK / '_build' / target / 'release' / 'build' / 'moonbit-community' / 'cmarkwrap' / 'lib' / ('lib.' + suffix)
        shutil.copy2(artifact, OUT / f'cmark-{stage}.{suffix if suffix == "wasm" else "mjs"}')
        if target == 'wasm-gc':
            run(['moon', 'build', 'upstream/cmark/cmarkwrap/src/lib', '--target', target, '--release', '--strip'], WORK, f'cmark-{stage}-stripped')
            shutil.copy2(artifact, OUT / f'cmark-{stage}-stripped.wasm')
    run(['moon', 'test', 'upstream/cmark/src/char', 'upstream/cmark/src/cmark', 'upstream/cmark/src/cmark_html', '--target', 'wasm-gc'], WORK, f'cmark-{stage}-tests')

run(['moon', 'build', '--target', 'js', '--release', '--deny-warn'], label='moonsize-core')
run(['moon', 'version', '--all'], label='toolchain')
run(['moon', 'update'], WORK, label='registry-update')
try:
    build_cmark('before')
    run(['node', 'scripts/analyze-cases.mjs', '--baseline'], label='baseline-analysis')
    changed_generator = (ROOT / 'cases/cmark/gen_entities.py').read_text(encoding='utf-8')
    changed_lookup = (ROOT / 'cases/cmark/html.mbt').read_text(encoding='utf-8')
    if changed_generator == originals[generator]:
        raise RuntimeError('Pinned generator no longer matches optimization')
    patch = ''
    for file, content in ((generator, changed_generator), (lookup, changed_lookup)):
        rel = file.relative_to(cmark).as_posix()
        patch += ''.join(difflib.unified_diff(originals[file].splitlines(keepends=True), content.splitlines(keepends=True), fromfile='a/' + rel, tofile='b/' + rel))
        file.write_text(content, encoding='utf-8')
    (OUT / 'cmark-optimization.patch').write_text(patch, encoding='utf-8')
    build_cmark('after')
    run(['moon', 'build', 'upstream/toml/toml_cli', '--target', 'wasm', '--release', '--no-strip'], WORK, 'toml-build')
    shutil.copy2(WORK / '_build/wasm/release/build/moonbit-community/toml_cli/toml_cli.wasm', OUT / 'toml-cli.wasm')
    run(['moon', 'test', 'upstream/toml', '--target', 'wasm'], WORK, 'toml-tests')
    dependencies = []
    for package in sorted((WORK / '.mooncakes').glob('*/*')):
        manifest = next((package / name for name in ('moon.mod', 'moon.mod.json') if (package / name).exists()), None)
        if manifest is not None:
            dependencies.append(dict(package=package.relative_to(WORK / '.mooncakes').as_posix(), manifest=manifest.read_text(encoding='utf-8'), sha256=hashlib.sha256(manifest.read_bytes()).hexdigest()))
            for license_file in package.iterdir():
                if license_file.is_file() and license_file.name.upper().split('.')[0] in ('LICENSE', 'NOTICE', 'COPYING'):
                    license_dest = OUT / 'licenses' / package.relative_to(WORK / '.mooncakes') / license_file.name
                    license_dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(license_file, license_dest)
    (OUT / 'dependencies.json').write_text(json.dumps(dependencies, indent=2) + '\n', encoding='utf-8')
    run(['node', 'scripts/analyze-cases.mjs'], label='verification')
    (OUT / 'provenance.json').write_text(json.dumps(dict(projects=PINS, commands=commands, python=sys.version, platform=sys.platform, host_adjustment='On Windows only: python3 launcher replaced with python in cmark pre-build. Same for both builds.', optimization='Replace static Json entity dictionary with sorted parallel FixedArray[String] tables and binary search. Same compiler, target, release and no-strip flags.'), indent=2) + '\n', encoding='utf-8')
finally:
    # Keep fetched source at its original semantics even when a build fails.
    for file, content in originals.items():
        file.write_text(content, encoding='utf-8')

print(f'Completed case studies: {OUT}', flush=True)
