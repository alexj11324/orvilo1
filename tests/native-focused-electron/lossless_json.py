"""Strict lossless JSON artifact decoder; ordinary JSON stays transparent."""
import codecs
import gzip
import hashlib
import json
from pathlib import Path
import re
import zlib

SCHEMA = 'native-lossless-json-artifact-v1'
PLAIN_LIMIT = 1024 * 1024
SERIALIZATION = 'JSON.stringify(value, null, 2) + newline'
MEMBERS = 'Concatenated standard gzip members, no logical byte changes'


def _file_sha(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        while chunk := stream.read(65536):
            digest.update(chunk)
    return digest.hexdigest()


def _read_text_record(file):
    file = Path(file)
    physical_sha = _file_sha(file)
    bindings = {file.name: physical_sha}
    descriptor = None
    if file.stat().st_size <= PLAIN_LIMIT:
        document = json.loads(file.read_text(encoding='utf-8'))
        if isinstance(document, dict) and document.get('schema') == SCHEMA:
            descriptor = document
    if descriptor is not None:
        keys = {'schema', 'encoding', 'logicalFile', 'bodyFile', 'logicalSHA256', 'logicalBytes',
                'gzipSHA256', 'gzipBytes', 'serialization', 'memberBoundary'}
        if (set(descriptor) != keys or descriptor['encoding'] != 'gzip' or
                descriptor['logicalFile'] != file.name or descriptor['bodyFile'] != file.name + '.gz' or
                descriptor['serialization'] != SERIALIZATION or descriptor['memberBoundary'] != MEMBERS or
                not isinstance(descriptor['logicalSHA256'], str) or not re.fullmatch('[0-9a-f]{64}', descriptor['logicalSHA256']) or
                not isinstance(descriptor['gzipSHA256'], str) or not re.fullmatch('[0-9a-f]{64}', descriptor['gzipSHA256']) or
                type(descriptor['logicalBytes']) is not int or not PLAIN_LIMIT < descriptor['logicalBytes'] <= 9007199254740991 or
                type(descriptor['gzipBytes']) is not int or not 0 < descriptor['gzipBytes'] <= 9007199254740991):
            raise ValueError('Invalid lossless JSON descriptor')
        body = file.parent / descriptor['bodyFile']
        if file.is_symlink() or not file.is_file() or body.is_symlink() or not body.is_file():
            raise ValueError('Lossless JSON descriptor/body must be ordinary files')
        if body.stat().st_size != descriptor['gzipBytes'] or _file_sha(body) != descriptor['gzipSHA256']:
            raise ValueError('Lossless JSON gzip bytes differ from descriptor')
        bindings[body.name] = descriptor['gzipSHA256']
        opener = lambda: gzip.open(body, 'rb')
    else:
        opener = lambda: file.open('rb')
    digest = hashlib.sha256()
    decoder = codecs.getincrementaldecoder('utf-8')(errors='strict')
    parts, count, final_byte = [], 0, None
    try:
        with opener() as stream:
            while chunk := stream.read(65536):
                count += len(chunk)
                if descriptor is not None and count > descriptor['logicalBytes']:
                    raise ValueError('Lossless JSON logical byte count exceeded')
                digest.update(chunk)
                parts.append(decoder.decode(chunk))
                final_byte = chunk[-1]
    except (OSError, EOFError, zlib.error) as error:
        raise ValueError('Lossless JSON decompression failed: ' + str(error)) from error
    parts.append(decoder.decode(b'', final=True))
    logical_sha = digest.hexdigest()
    if descriptor is not None and (count != descriptor['logicalBytes'] or logical_sha != descriptor['logicalSHA256'] or final_byte != 10):
        raise ValueError('Lossless JSON logical bytes differ from descriptor')
    if _file_sha(file) != physical_sha or descriptor is not None and _file_sha(body) != descriptor['gzipSHA256']:
        raise ValueError('Lossless JSON physical files changed while decoding')
    text = ''.join(parts)
    parts.clear()
    return text, {'logicalSHA256': logical_sha, 'logicalBytes': count, 'storageFilesSHA256': bindings,
                  'encoding': 'gzip' if descriptor is not None else 'plain-json'}


def read_lossless_json_bytes(file):
    text, _ = _read_text_record(file)
    return text.encode('utf-8')


def load_lossless_json_artifact(file):
    text, receipt = _read_text_record(file)
    receipt['value'] = json.loads(text)
    return receipt


def load_lossless_json(file):
    return load_lossless_json_artifact(file)['value']
