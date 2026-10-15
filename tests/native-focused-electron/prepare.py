#!/usr/bin/env python3
"""Prepare a new runtime binding; never relabel prior runtime evidence."""
import argparse, pathlib, subprocess, hashlib, json, shutil, urllib.request, tarfile, io, base64
p=argparse.ArgumentParser();p.add_argument('--root',required=True,type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);p.add_argument('--revision',required=True);a=p.parse_args();r=a.root.resolve();d=a.output
if len(a.revision)!=40 or any(c not in '0123456789abcdef' for c in a.revision):raise RuntimeError('Exact lowercase 40-char revision required')
def git(*args):return subprocess.check_output(['git','-C',str(r),*args])
def h(b):return hashlib.sha256(b).hexdigest()
if git('rev-parse','HEAD').decode().strip()!=a.revision or git('status','--porcelain').strip():raise RuntimeError('Exact clean candidate required')
if d.exists():raise RuntimeError('Fresh harness directory required')
shutil.copytree(pathlib.Path(__file__).parent,d);(d/'product').symlink_to(r,target_is_directory=True);(d/'node_modules').symlink_to(r/'node_modules',target_is_directory=True)
archives={}
for name in ['public-asset-manifest.json','public-document-asset-manifest.json','public-stylesheet-font-manifest.json']:
 for item in json.loads((d/name).read_text())['assets']:
  key=(item['package'],item['version']);archive=archives.get(key)
  if archive is None:
   package,version=key;url='https://registry.npmjs.org/'+package+'/-/'+package.split('/')[-1]+'-'+version+'.tgz'
   with urllib.request.urlopen(url,timeout=60) as res:archive=res.read()
   if h(archive)!=item['registryArchiveSha256']:raise RuntimeError('Pinned registry archive SHA differs')
   sri='sha512-'+base64.b64encode(hashlib.sha512(archive).digest()).decode()
   if sri!=item['registrySRI']:raise RuntimeError('Pinned registry integrity differs')
   archives[key]=archive
  with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as tf:body=tf.extractfile(item.get('archiveMember',item.get('member'))).read()
  if len(body)!=item['bytes'] or h(body)!=item['sha256']:raise RuntimeError('Pinned public asset bytes differ')
  target=d/item['bodyPath'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(body)
# Bind ALL tracked candidate inputs, plus installed graph metadata; not historical 107 hashes.
tracked=git('ls-files','-z').decode().split('\0');product={}
for name in tracked:
 if name and (r/name).is_file():product[name]=h((r/name).read_bytes())
for metadata in ['node_modules/.modules.yaml', 'apps/desktop/node_modules/.modules.yaml']:
 product[metadata]=h((r/metadata).read_bytes())
source={str(f.relative_to(d)):h(f.read_bytes()) for f in d.rglob('*') if f.is_file() and not f.is_symlink()}
binding={'head':a.revision,'tree':git('rev-parse','HEAD^{tree}').decode().strip(),'gitIndexSHA256':h(git('ls-files','-s','-z')),'productFiles':product,'sourceFiles':source,'runtimeEvidenceReused':False,'purpose':'fresh CI binding, all tracked files and current installation metadata'}
(d/'binding.json').write_text(json.dumps(binding,indent=2)+'\n')
