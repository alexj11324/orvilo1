// Upstream catalog; original installed package MIT notice in LOBEHUB-LICENSE.txt.
// Complete current SDK language selector contract; parser ownership is separate.
export interface NativeCodeLanguageDescription {
  readonly ext?: readonly string[];
  readonly name: string;
  readonly syntax: string;
  readonly value: string;
}
export const nativeCodeLanguages = [
  {
    name: 'Plain Text',
    syntax: 'simplemode',
    value: 'plain',
  },
  {
    name: 'ABAP',
    syntax: 'abap',
    value: 'abap',
  },
  {
    ext: ['agda'],
    name: 'Agda',
    syntax: 'text/x-agda',
    value: 'agda',
  },
  {
    ext: ['ets', 'arkts'],
    name: 'ArkTS',
    syntax: 'text/x-arkts',
    value: 'arkts',
  },
  {
    ext: ['bash'],
    name: 'Bash',
    syntax: 'shell',
    value: 'bash',
  },
  {
    ext: ['vbs'],
    name: 'Basic',
    syntax: 'vbscript',
    value: 'basic',
  },
  {
    ext: ['c', 'h', 'ino'],
    name: 'C',
    syntax: 'text/x-csrc',
    value: 'c',
  },
  {
    ext: ['cs'],
    name: 'C#',
    syntax: 'text/x-csharp',
    value: 'csharp',
  },
  {
    ext: ['cpp', 'c++', 'cc', 'cxx', 'hpp', 'h++', 'hh', 'hxx'],
    name: 'C++',
    syntax: 'text/x-c++src',
    value: 'cpp',
  },
  {
    ext: ['clj', 'cljc', 'cljx'],
    name: 'Clojure',
    syntax: 'clojure',
    value: 'clojure',
  },
  {
    ext: ['cmake'],
    name: 'CMake',
    syntax: 'cmake',
    value: 'cmake',
  },
  {
    ext: ['css'],
    name: 'CSS',
    syntax: 'css',
    value: 'css',
  },
  {
    ext: ['cyp', 'cypher'],
    name: 'Cypher',
    syntax: 'cypher',
    value: 'cypher',
  },
  {
    ext: ['dart'],
    name: 'Dart',
    syntax: 'dart',
    value: 'dart',
  },
  {
    ext: ['diff', 'patch'],
    name: 'Diff',
    syntax: 'diff',
    value: 'diff',
  },
  {
    name: 'Dockerfile',
    syntax: 'dockerfile',
    value: 'dockerfile',
  },
  {
    ext: ['erl'],
    name: 'Erlang',
    syntax: 'erlang',
    value: 'erlang',
  },
  {
    ext: ['fs'],
    name: 'F#',
    syntax: 'mllike',
    value: 'f#',
  },
  {
    ext: ['f90', 'f95', 'f03'],
    name: 'Fortran',
    syntax: 'fortran',
    value: 'fortran',
  },
  {
    name: 'Git',
    syntax: 'shell',
    value: 'git',
  },
  {
    ext: ['glsl'],
    name: 'Glsl',
    syntax: 'x-shader/x-vertex',
    value: 'glsl',
  },
  {
    ext: ['go'],
    name: 'Go',
    syntax: 'go',
    value: 'go',
  },
  {
    name: 'GraphQL',
    syntax: 'graphql',
    value: 'graphql',
  },
  {
    ext: ['groovy', 'gradle'],
    name: 'Groovy',
    syntax: 'groovy',
    value: 'groovy',
  },
  {
    ext: ['hs'],
    name: 'Haskell',
    syntax: 'haskell',
    value: 'haskell',
  },
  {
    ext: ['html', 'htm', 'handlebars', 'hbs'],
    name: 'HTML',
    syntax: 'htmlmixed',
    value: 'html',
  },
  {
    name: 'HTTP',
    syntax: 'http',
    value: 'http',
  },
  {
    ext: ['java'],
    name: 'Java',
    syntax: 'text/x-java',
    value: 'java',
  },
  {
    ext: ['js'],
    name: 'JavaScript',
    syntax: 'text/javascript',
    value: 'javascript',
  },
  {
    ext: ['json', 'map'],
    name: 'JSON',
    syntax: 'application/json',
    value: 'json',
  },
  {
    ext: ['jsx'],
    name: 'JSX',
    syntax: 'jsx',
    value: 'jsx',
  },
  {
    ext: ['jl'],
    name: 'Julia',
    syntax: 'julia',
    value: 'julia',
  },
  {
    name: 'KaTeX',
    syntax: 'simplemode',
    value: 'katex',
  },
  {
    ext: ['kt'],
    name: 'Kotlin',
    syntax: 'text/x-kotlin',
    value: 'kotlin',
  },
  {
    ext: ['text', 'ltx', 'tex'],
    name: 'LaTeX',
    syntax: 'text/x-latex',
    value: 'latex',
  },
  {
    ext: ['less'],
    name: 'Less',
    syntax: 'css',
    value: 'less',
  },
  {
    ext: ['cl', 'lisp', 'el'],
    name: 'Lisp',
    syntax: 'commonlisp',
    value: 'commonlisp',
  },
  {
    ext: ['lua'],
    name: 'Lua',
    syntax: 'text/x-lua',
    value: 'lua',
  },
  {
    name: 'Makefile',
    syntax: 'cmake',
    value: 'makefile',
  },
  {
    ext: ['markdown', 'md', 'mkd'],
    name: 'Markdown',
    syntax: 'markdown',
    value: 'markdown',
  },
  {
    name: 'MATLAB',
    syntax: 'octave',
    value: 'matlab',
  },
  {
    ext: ['mermaid', 'mmd'],
    name: 'Mermaid',
    syntax: 'simplemode',
    value: 'mermaid',
  },
  {
    ext: ['conf'],
    name: 'Nginx',
    syntax: 'nginx',
    value: 'nginx',
  },
  {
    ext: ['m'],
    name: 'Objective-C',
    syntax: 'text/x-objectivec',
    value: 'objectivec',
  },
  {
    ext: ['ml', 'mli', 'mll', 'mly'],
    name: 'OCaml',
    syntax: 'mllike',
    value: 'ocaml',
  },
  {
    ext: ['p', 'pas'],
    name: 'Pascal',
    syntax: 'pascal',
    value: 'pascal',
  },
  {
    ext: ['pl', 'pm'],
    name: 'Perl',
    syntax: 'perl',
    value: 'perl',
  },
  {
    ext: ['php', 'php3', 'php4', 'php5', 'php7', 'phtml'],
    name: 'PHP',
    syntax: 'text/x-php',
    value: 'php',
  },
  {
    name: 'PL/SQL',
    syntax: 'text/x-plsql',
    value: 'plsql',
  },
  {
    ext: ['ps1', 'psd1', 'psm1'],
    name: 'PowerShell',
    syntax: 'powershell',
    value: 'powershell',
  },
  {
    ext: ['properties', 'ini', 'in'],
    name: 'Properties',
    syntax: 'properties',
    value: 'properties',
  },
  {
    ext: ['proto'],
    name: 'Protobuf',
    syntax: 'protobuf',
    value: 'protobuf',
  },
  {
    ext: ['build', 'bzl', 'py', 'pyw'],
    name: 'Python',
    syntax: 'python',
    value: 'python',
  },
  {
    ext: ['r', 'R'],
    name: 'R',
    syntax: 'r',
    value: 'r',
  },
  {
    ext: ['rb'],
    name: 'Ruby',
    syntax: 'ruby',
    value: 'ruby',
  },
  {
    ext: ['rs'],
    name: 'Rust',
    syntax: 'rust',
    value: 'rust',
  },
  {
    ext: ['sass', 'scss'],
    name: 'Sass',
    syntax: 'text/x-sass',
    value: 'sass',
  },
  {
    ext: ['scala'],
    name: 'Scala',
    syntax: 'text/x-scala',
    value: 'scala',
  },
  {
    ext: ['scm', 'ss'],
    name: 'Scheme',
    syntax: 'scheme',
    value: 'scheme',
  },
  {
    ext: ['sh', 'ksh'],
    name: 'Shell',
    syntax: 'shell',
    value: 'shell',
  },
  {
    ext: ['sol'],
    name: 'Solidity',
    syntax: 'solidity',
    value: 'solidity',
  },
  {
    ext: ['sql'],
    name: 'SQL',
    syntax: 'text/x-sql',
    value: 'sql',
  },
  {
    name: 'sTeX',
    syntax: 'text/x-stex',
    value: 'stex',
  },
  {
    ext: ['swift'],
    name: 'Swift',
    syntax: 'swift',
    value: 'swift',
  },
  {
    ext: ['sv', 'svh'],
    name: 'SystemVerilog',
    syntax: 'text/x-systemverilog',
    value: 'systemverilog',
  },
  {
    ext: ['tcl'],
    name: 'Tcl',
    syntax: 'text/x-tcl',
    value: 'tcl',
  },
  {
    ext: ['toml'],
    name: 'TOML',
    syntax: 'toml',
    value: 'toml',
  },
  {
    ext: ['tsx'],
    name: 'TSX',
    syntax: 'jsx',
    value: 'tsx',
  },
  {
    ext: ['ts'],
    name: 'TypeScript',
    syntax: 'text/typescript',
    value: 'typescript',
  },
  {
    ext: ['vb'],
    name: 'VB.net',
    syntax: 'vb',
    value: 'vbnet',
  },
  {
    ext: ['vtl'],
    name: 'Velocity',
    syntax: 'velocity',
    value: 'velocity',
  },
  {
    ext: ['v'],
    name: 'Verilog',
    syntax: 'text/x-verilog',
    value: 'verilog',
  },
  {
    name: 'Vue',
    syntax: 'text/x-vue',
    value: 'vue',
  },
  {
    ext: ['xml', 'xsl', 'xsd', 'svg'],
    name: 'XML',
    syntax: 'xml',
    value: 'xml',
  },
  {
    ext: ['yaml', 'yml'],
    name: 'YAML',
    syntax: 'yaml',
    value: 'yaml',
  },
] as const satisfies readonly NativeCodeLanguageDescription[];

const includesExtension = (extensions: readonly string[], value: string) =>
  extensions.includes(value);

/** Keep current modeMatch ordering, lowercasing and extension aliases. */
export function resolveNativeCodeLanguage(value = ''): NativeCodeLanguageDescription {
  const normalized = value.toLocaleLowerCase() || 'plain';
  return (
    nativeCodeLanguages.find(
      (mode) =>
        mode.value === normalized || ('ext' in mode && includesExtension(mode.ext, normalized)),
    ) ?? nativeCodeLanguages[0]
  );
}
