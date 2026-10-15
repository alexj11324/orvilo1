#!/usr/bin/env node
// Keep the original simplified-Chinese UI stack and reject local UI font overrides.
// This is a source guard; browser font availability and glyph fallback need runtime checks.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { genFontFamily, genFontFamilyCode } from '../../src/const/font.ts';

const root = path.resolve(import.meta.dirname, '../..');
const fontSource = readFileSync(path.join(root, 'src/const/font.ts'), 'utf8');
const source = ts.createSourceFile('font.ts', fontSource, ts.ScriptTarget.Latest, true);
const originalScStack = [
  'HarmonyOS Sans SC',
  'PingFang SC',
  'Hiragino Sans GB',
  'Microsoft YaHei UI',
  'Microsoft YaHei',
  'Source Han Sans SC',
  'Noto Sans CJK SC',
];

const scDeclaration = source.statements.find(
  (statement) =>
    ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(
      (declaration) => declaration.name.getText(source) === 'FONT_SC',
    ),
);
const scValues = scDeclaration?.declarationList.declarations
  .find((declaration) => declaration.name.getText(source) === 'FONT_SC')
  ?.initializer?.elements?.map((element) => (ts.isStringLiteral(element) ? element.text : null));
const findings = [];
if (JSON.stringify(scValues) !== JSON.stringify(originalScStack)) {
  findings.push(
    'src/const/font.ts: FONT_SC must match the original simplified-Chinese fallback order',
  );
}

const originalDefault = [
  'Geist',
  '-apple-system',
  'BlinkMacSystemFont',
  'Segoe UI Variable Display',
  'Segoe UI',
  'Roboto',
  'Helvetica Neue',
  'Arial',
  ...originalScStack,
  'ui-sans-serif',
  'system-ui',
  'sans-serif',
  'Apple Color Emoji',
  'Segoe UI Emoji',
  'Segoe UI Symbol',
  'Noto Color Emoji',
];
const stripQuotes = (value) => value.trim().replaceAll(/^["']|["']$/g, '');
const family = genFontFamily({ locale: 'zh-CN' }).split(',').map(stripQuotes);
if (JSON.stringify(family) !== JSON.stringify(originalDefault)) {
  findings.push('genFontFamily(zh-CN): default UI family must match the initial commit');
}
const originalCodeDefault = [
  'Geist Mono',
  'ui-monospace',
  'SFMono-Regular',
  'SF Mono',
  'Menlo',
  'Cascadia Code',
  'Consolas',
  'Liberation Mono',
  ...originalScStack,
  'monospace',
  'Apple Color Emoji',
  'Segoe UI Emoji',
  'Segoe UI Symbol',
  'Noto Color Emoji',
];
if (
  JSON.stringify(genFontFamilyCode({ locale: 'zh-CN' }).split(',').map(stripQuotes)) !==
  JSON.stringify(originalCodeDefault)
) {
  findings.push(
    'genFontFamilyCode(zh-CN): code family must retain the canonical Chinese fallback stack',
  );
}
if (
  stripQuotes(genFontFamily({ locale: 'zh-CN', userFontFamily: 'User Choice' }).split(',')[0]) !==
  'User Choice'
) {
  findings.push('genFontFamily(zh-CN): explicit user font preference must stay first');
}
if (
  stripQuotes(genFontFamilyCode({ locale: 'zh-CN', userFontFamily: 'User Code' }).split(',')[0]) !==
  'User Code'
) {
  findings.push('genFontFamilyCode(zh-CN): explicit user code font preference must stay first');
}

const importedNames = (parsed, module, exported) =>
  new Set(
    parsed.statements.flatMap((statement) => {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== module ||
        !statement.importClause
      )
        return [];
      if (exported === 'default')
        return statement.importClause.name ? [statement.importClause.name.text] : [];
      const bindings = statement.importClause.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) return [];
      return bindings.elements
        .filter((binding) => (binding.propertyName ?? binding.name).text === exported)
        .map((binding) => binding.name.text);
    }),
  );

// These two native roles are resolved by the real document publisher. Never
// treat an arbitrary custom property, local generator or font stack as a role.
function verifyNativeFontProducer(verifiedSites = new Map()) {
  // This is a deliberately narrow source contract, not an import/path exemption.
  // Every forwarding expression must connect to a returned, imported producer.
  const parse = (file) =>
    ts.createSourceFile(
      file,
      readFileSync(path.join(root, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
  const text = (node, file) => node?.getText(file).replaceAll(/\s/g, '');
  const nodes = (node, predicate) => {
    const found = [];
    const walk = (current) => {
      if (predicate(current)) found.push(current);
      ts.forEachChild(current, walk);
    };
    walk(node);
    return found;
  };
  const exported = (node) =>
    node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  const fn = (file, name) =>
    file.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === name && exported(node),
    );
  const unwrap = (node) => {
    while (node && ts.isParenthesizedExpression(node)) node = node.expression;
    return node;
  };
  const returned = (body) => {
    const returns = body && ts.isBlock(body) ? body.statements.filter(ts.isReturnStatement) : [];
    return returns.length === 1 ? unwrap(returns[0].expression) : undefined;
  };
  const imports = (file, module, name) => importedNames(file, module, name);
  const callOf = (node, names) =>
    node &&
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    names.has(node.expression.text);
  const declarations = (body, name) =>
    nodes(
      body,
      (node) =>
        ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name,
    );
  const constValue = (body, name) => {
    const matches = declarations(body, name);
    return matches.length === 1 && matches[0].parent.flags & ts.NodeFlags.Const
      ? matches[0].initializer
      : undefined;
  };
  const noWrites = (body, names) =>
    !nodes(
      body,
      (node) =>
        (ts.isBinaryExpression(node) &&
          node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
          names.some(
            (name) =>
              text(node.left, node.getSourceFile()) === name ||
              text(node.left, node.getSourceFile())?.startsWith(`${name}.`),
          )) ||
        ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
          (node.operator === ts.SyntaxKind.PlusPlusToken ||
            node.operator === ts.SyntaxKind.MinusMinusToken) &&
          names.includes(text(node.operand, node.getSourceFile()))),
    ).length;
  const field = (object, name, file) => {
    if (
      !object ||
      !ts.isObjectLiteralExpression(object) ||
      object.properties.some(ts.isSpreadAssignment)
    )
      return;
    const entries = object.properties.filter((property) => text(property.name, file) === name);
    if (entries.length !== 1) return;
    const property = entries[0];
    return ts.isShorthandPropertyAssignment(property)
      ? property.name
      : ts.isPropertyAssignment(property)
        ? property.initializer
        : undefined;
  };
  const binding = (pattern, names, file) =>
    pattern &&
    ts.isObjectBindingPattern(pattern) &&
    names.every(
      (name) =>
        pattern.elements.filter(
          (element) =>
            !element.dotDotDotToken &&
            !element.propertyName &&
            !element.initializer &&
            text(element.name, file) === name,
        ).length === 1,
    );
  const opening = (node) =>
    ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : undefined;
  const tagIs = (node, names) =>
    node && ts.isIdentifier(node.tagName) && names.has(node.tagName.text);
  const attr = (node, name) => {
    if (!node || node.attributes.properties.some(ts.isJsxSpreadAttribute)) return;
    const matches = node.attributes.properties.filter(
      (property) => ts.isJsxAttribute(property) && property.name.text === name,
    );
    return matches.length === 1 ? matches[0] : undefined;
  };
  const attrValue = (node, name) => {
    const value = attr(node, name)?.initializer;
    return value && ts.isJsxExpression(value) ? value.expression : undefined;
  };
  const memoCall = (value, file) => {
    if (!callOf(value, imports(file, 'react', 'useMemo')) || value.arguments.length !== 2) return;
    const [callback, dependencies] = value.arguments;
    if (!ts.isArrowFunction(callback) || !ts.isArrayLiteralExpression(dependencies)) return;
    return {
      expression: ts.isBlock(callback.body) ? returned(callback.body) : callback.body,
      dependencies,
    };
  };
  const fonts = ['fontFamily', 'fontFamilyCode'];
  try {
    const roles = parse('src/styles/resolvedThemeRoles.ts');
    const styleDeclaration = roles.statements
      .filter(ts.isVariableStatement)
      .filter(exported)
      .flatMap((statement) => [...statement.declarationList.declarations])
      .filter((node) => text(node.name, roles) === 'createThemeRoleStyles');
    const producer = styleDeclaration.length === 1 ? styleDeclaration[0].initializer : undefined;
    if (
      !producer ||
      !ts.isArrowFunction(producer) ||
      text(producer.parameters[0]?.name, roles) !== 'theme'
    )
      return false;
    const template = returned(producer.body);
    if (
      !template ||
      !ts.isTemplateExpression(template) ||
      [...template.getText(roles).matchAll(/--font-(?:sans|mono)\s*:/g)].length !== 2
    )
      return false;
    const mappings = new Map();
    let literal = template.head.text;
    for (const span of template.templateSpans) {
      const key = literal.match(/(--font-(?:sans|mono)):\s*$/)?.[1];
      if (key) {
        if (mappings.has(key) || !span.literal.text.startsWith(';')) return false;
        mappings.set(key, text(span.expression, roles));
      }
      literal = span.literal.text;
    }
    if (
      mappings.get('--font-sans') !== 'theme.fontFamily' ||
      mappings.get('--font-mono') !== 'theme.fontFamilyCode'
    )
      return false;
    const roleReturn = returned(fn(roles, 'ResolvedThemeRoles')?.body);
    if (
      !roleReturn ||
      !nodes(
        roleReturn,
        (node) =>
          callOf(node, imports(roles, 'react', 'createElement')) &&
          ts.isStringLiteral(node.arguments[0]) &&
          node.arguments[0].text === 'style' &&
          text(node.arguments[2], roles) === 'createThemeRoleStyles(theme)',
      ).length
    )
      return false;

    // The old public entry must really re-export and delegate to the same owner.
    const legacy = parse('src/styles/themeRoles.ts');
    if (
      !legacy.statements.some(
        (node) =>
          ts.isExportDeclaration(node) &&
          !node.exportClause &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          node.moduleSpecifier.text === './resolvedThemeRoles',
      )
    )
      return false;
    const legacyBody = fn(legacy, 'ThemeRoles')?.body;
    let legacyTheme = constValue(legacyBody, 'theme');
    while (
      legacyTheme &&
      (ts.isAsExpression(legacyTheme) || ts.isParenthesizedExpression(legacyTheme))
    )
      legacyTheme = legacyTheme.expression;
    if (
      !callOf(legacyTheme, imports(legacy, 'react', 'use')) ||
      legacyTheme.arguments.length !== 1 ||
      !imports(legacy, '@emotion/react', 'ThemeContext').has(text(legacyTheme.arguments[0], legacy))
    )
      return false;
    const legacyReturn = returned(legacyBody);
    if (
      !callOf(legacyReturn, imports(legacy, 'react', 'createElement')) ||
      !imports(legacy, './resolvedThemeRoles', 'ResolvedThemeRoles').has(
        text(legacyReturn.arguments[0], legacy),
      ) ||
      text(field(legacyReturn.arguments[1], 'theme', legacy), legacy) !== 'theme' ||
      !noWrites(legacyBody, ['theme'])
    )
      return false;

    const appFile = 'src/layout/GlobalProvider/AppTheme.tsx';
    const app = parse(appFile);
    const appDeclaration = app.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => [...statement.declarationList.declarations])
      .find((node) => text(node.name, app) === 'AppTheme');
    const initializer = appDeclaration?.initializer;
    if (
      !callOf(initializer, imports(app, 'react', 'memo')) ||
      !ts.isArrowFunction(initializer.arguments[0]) ||
      !app.statements.some(
        (node) =>
          ts.isExportAssignment(node) &&
          !node.isExportEquals &&
          text(node.expression, app) === 'AppTheme',
      )
    )
      return false;
    const appBody = initializer.arguments[0].body;
    for (const name of fonts) {
      const value = memoCall(constValue(appBody, name), app);
      if (
        !value ||
        !callOf(
          value.expression,
          imports(
            app,
            '@/const/font',
            name === 'fontFamily' ? 'genFontFamily' : 'genFontFamilyCode',
          ),
        )
      )
        return false;
      const expected =
        name === 'fontFamily'
          ? {
              customFontFamily: 'customFontFamily',
              locale: 'resolveUILocale(language).normalizedLocale',
              userFontFamily: 'userFontFamily',
            }
          : {
              locale: 'resolveUILocale(language).normalizedLocale',
              userFontFamily: 'userFontFamilyCode',
            };
      const params = value.expression.arguments[0];
      if (
        !params ||
        !ts.isObjectLiteralExpression(params) ||
        params.properties.length !== Object.keys(expected).length ||
        !Object.entries(expected).every(
          ([key, expression]) => text(field(params, key, app), app) === expression,
        ) ||
        !imports(app, '@/libs/getUILocaleAndResources.utils', 'resolveUILocale').has(
          'resolveUILocale',
        )
      )
        return false;
      const deps = value.dependencies.elements.map((node) => text(node, app));
      const required =
        name === 'fontFamily'
          ? ['customFontFamily', 'language', 'userFontFamily']
          : ['language', 'userFontFamilyCode'];
      if (deps.length !== required.length || !required.every((name) => deps.includes(name)))
        return false;
    }
    if (!noWrites(appBody, fonts)) return false;
    const appReturn = returned(appBody);
    if (!appReturn) return false;
    const providerNames = new Set([
      ...imports(app, '@lobehub/ui', 'ThemeProvider'),
      ...imports(app, '@lobehub/ui/es/ThemeProvider/ThemeProvider', 'default'),
    ]);
    const sdk = nodes(
      appReturn,
      (node) => ts.isJsxElement(node) && tagIs(opening(node), providerNames),
    );
    if (sdk.length !== 1) return false;
    const theme = attrValue(opening(sdk[0]), 'theme');
    const token = field(theme, 'token', app);
    if (!fonts.every((name) => text(field(token, name, app), app) === name)) return false;
    const native = nodes(
      sdk[0],
      (node) =>
        ts.isJsxElement(node) &&
        tagIs(opening(node), imports(app, './NativeAppTheme', 'NativeAppTheme')),
    );
    if (
      native.length !== 1 ||
      !fonts.every((name) => text(attrValue(opening(native[0]), name), app) === name)
    )
      return false;

    const frame = parse('src/layout/GlobalProvider/NativeAppTheme.tsx');
    const frameFunction = fn(frame, 'NativeAppTheme');
    const frameBindings = frameFunction?.parameters[0]?.name;
    if (
      !frameBindings ||
      !ts.isObjectBindingPattern(frameBindings) ||
      frameBindings.elements.length !== 2 ||
      !binding(frameBindings, ['children'], frame) ||
      !frameBindings.elements.some(
        (node) => node.dotDotDotToken && text(node.name, frame) === 'options',
      )
    )
      return false;
    const frameReturn = returned(frameFunction.body);
    const frameOpening = opening(frameReturn);
    if (
      !tagIs(frameOpening, imports(frame, './NativeThemeProvider', 'NativeThemeProvider')) ||
      frameOpening.attributes.properties.length !== 1 ||
      !ts.isJsxSpreadAttribute(frameOpening.attributes.properties[0]) ||
      text(frameOpening.attributes.properties[0].expression, frame) !== 'options' ||
      frameFunction.body.statements.length !== 1
    )
      return false;

    const provider = parse('src/layout/GlobalProvider/NativeThemeProvider.tsx');
    const providerFunction = fn(provider, 'NativeThemeProvider');
    if (!binding(providerFunction?.parameters[0]?.name, fonts, provider)) return false;
    for (const name of ['light', 'dark']) {
      const value = memoCall(constValue(providerFunction.body, name), provider);
      if (
        !value ||
        !callOf(value.expression, imports(provider, '@/styles/nativeTheme', 'resolveNativeTheme'))
      )
        return false;
      const options = value.expression.arguments[0];
      const appearance = field(options, 'appearance', provider);
      if (
        !appearance ||
        !ts.isStringLiteral(appearance) ||
        appearance.text !== name ||
        !fonts.every(
          (font) =>
            text(field(options, font, provider), provider) === font &&
            value.dependencies.elements.some((node) => text(node, provider) === font),
        )
      )
        return false;
    }
    if (!noWrites(providerFunction.body, [...fonts, 'light', 'dark'])) return false;
    const providerReturn = returned(providerFunction.body);
    if (
      !tagIs(
        opening(providerReturn),
        imports(provider, '@/styles/resolvedThemeRoles', 'ResolvedThemeRoles'),
      ) ||
      text(attrValue(opening(providerReturn), 'theme'), provider) !==
        "appearance==='dark'?dark:light"
    )
      return false;
    // A descendant AST match is not proof of publication: false && <style>,
    // callbacks and unmounted wrapper props all contain JSX without emitting it.
    // The actual provider contract publishes one unconditional direct child.
    if (!ts.isJsxElement(providerReturn)) return false;
    const sheets = providerReturn.children.filter(
      (node) => ts.isJsxElement(node) && text(node.openingElement.tagName, provider) === 'style',
    );
    const allSheets = nodes(
      providerReturn,
      (node) => ts.isJsxElement(node) && text(node.openingElement.tagName, provider) === 'style',
    );
    if (sheets.length !== 1 || allSheets.length !== 1) return false;
    const expressions = sheets[0].children.filter(ts.isJsxExpression);
    const sum = expressions.length === 1 ? expressions[0].expression : undefined;
    if (
      !sum ||
      !ts.isBinaryExpression(sum) ||
      sum.operatorToken.kind !== ts.SyntaxKind.PlusToken ||
      ![sum.left, sum.right].every(
        (node, index) =>
          callOf(node, imports(provider, '@/styles/resolvedThemeRoles', 'createThemeRoleStyles')) &&
          node.arguments.length === 1 &&
          text(node.arguments[0], provider) === ['light', 'dark'][index],
      )
    )
      return false;

    const resolver = parse('src/styles/nativeTheme.ts');
    const resolverFunction = fn(resolver, 'resolveNativeTheme');
    if (text(resolverFunction?.parameters[0]?.name, resolver) !== 'options') return false;
    const bindings = nodes(
      resolverFunction.body,
      (node) =>
        ts.isVariableDeclaration(node) &&
        text(node.initializer, resolver) === 'options' &&
        binding(node.name, fonts, resolver),
    );
    if (
      bindings.length !== 1 ||
      !(bindings[0].parent.flags & ts.NodeFlags.Const) ||
      !noWrites(resolverFunction.body, [...fonts, 'options'])
    )
      return false;
    const result = returned(resolverFunction.body);
    if (!fonts.every((name) => text(field(result, name, resolver), resolver) === name))
      return false;

    // Auth's real host computes the same canonical fonts directly, then feeds
    // both retained SDK tokens and the already-verified native publisher.
    const authFile = 'src/features/AuthShell/AuthThemeLite.tsx';
    const auth = parse(authFile);
    const authDeclaration = auth.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => [...statement.declarationList.declarations])
      .find((node) => text(node.name, auth) === 'AuthThemeLite');
    const authInitializer = authDeclaration?.initializer;
    if (
      !callOf(authInitializer, imports(auth, 'react', 'memo')) ||
      !ts.isArrowFunction(authInitializer.arguments[0]) ||
      !auth.statements.some(
        (node) =>
          ts.isExportAssignment(node) &&
          !node.isExportEquals &&
          text(node.expression, auth) === 'AuthThemeLite',
      )
    )
      return false;
    const authBody = authInitializer.arguments[0].body;
    const localeSources = nodes(
      authBody,
      (node) =>
        ts.isVariableDeclaration(node) &&
        binding(node.name, ['i18n'], auth) &&
        callOf(node.initializer, imports(auth, 'react-i18next', 'useTranslation')),
    );
    if (
      localeSources.length !== 1 ||
      !(localeSources[0].parent.flags & ts.NodeFlags.Const) ||
      !noWrites(authBody, [...fonts, 'i18n'])
    )
      return false;
    for (const name of fonts) {
      const value = constValue(authBody, name);
      if (
        !callOf(
          value,
          imports(
            auth,
            '@/const/font',
            name === 'fontFamily' ? 'genFontFamily' : 'genFontFamilyCode',
          ),
        ) ||
        value.arguments.length !== 1 ||
        !ts.isObjectLiteralExpression(value.arguments[0]) ||
        value.arguments[0].properties.length !== 1 ||
        text(field(value.arguments[0], 'locale', auth), auth) !== 'i18n.language'
      )
        return false;
    }
    const authReturn = returned(authBody);
    if (!authReturn) return false;
    const authSDK = nodes(
      authReturn,
      (node) =>
        ts.isJsxElement(node) &&
        tagIs(opening(node), imports(auth, '@lobehub/ui', 'ThemeProvider')),
    );
    if (authSDK.length !== 1) return false;
    const authToken = field(attrValue(opening(authSDK[0]), 'theme'), 'token', auth);
    if (!fonts.every((name) => text(field(authToken, name, auth), auth) === name)) return false;
    const authNative = nodes(
      authSDK[0],
      (node) =>
        ts.isJsxElement(node) &&
        tagIs(
          opening(node),
          imports(auth, '@/layout/GlobalProvider/NativeThemeProvider', 'NativeThemeProvider'),
        ),
    );
    if (
      authNative.length !== 1 ||
      !fonts.every((name) => text(attrValue(opening(authNative[0]), name), auth) === name)
    )
      return false;

    // Grant only the exact proven AST sites, after every edge passes. Arbitrary
    // local JSX props or variables with these names are still rejected below.
    verifiedSites.set(
      appFile,
      new Set(fonts.map((name) => attr(opening(native[0]), name).getStart(app))),
    );
    verifiedSites.set(
      authFile,
      new Set(fonts.map((name) => attr(opening(authNative[0]), name).getStart(auth))),
    );
    return true;
  } catch {
    return false;
  }
}
const verifiedNativeFontSites = new Map();
const nativeFontProducerVerified = verifyNativeFontProducer(verifiedNativeFontSites);
if (!nativeFontProducerVerified)
  findings.push(
    'Native font roles must retain the canonical generator -> AppTheme token/props -> NativeAppTheme -> NativeThemeProvider -> resolver -> resolvedThemeRoles publisher chain and real ThemeRoles compatibility re-export, including canonical AuthThemeLite token/native props',
  );

// Narrow exceptions for content rendering and UI outside ThemeProvider.
const allowedByFile = new Map([
  ['src/components/Loading/BrandTextLoading/index.module.css', [/^ui-monospace,.*monospace$/s]], // debug output
  ['src/features/Conversation/Messages/User/components/PageSelections.tsx', [/^Georgia, serif$/]], // quote mark
  ['src/features/ChatTerminal/xtermManager.ts', [/^fontFamily$/]], // terminal preference
  [
    'src/features/ResourceManager/components/Explorer/ListView/ListItem/TruncatedFileName.tsx',
    [/^window\.getComputedStyle\(container\)\.font$/],
  ], // canvas text measurement
  [
    'src/features/Portal/LocalFile/xlsx/SheetGrid.tsx',
    [/^`"\$\{style\.ff\}", var\(--font-family, sans-serif\)`$/],
  ], // spreadsheet cell
  [
    'src/features/Settings/appearance/features/Font/FallbackFontList.tsx',
    [/^(?:item\.id|fallbackFont)$/],
  ], // font preview
  ['src/features/Settings/appearance/features/Font/index.tsx', [/^joinFontStack\(stack\)$/]], // saved preference
  ['src/spa/router/authRouter.config.tsx', [/^sans-serif$/]], // fallback before theme mounts
]);
const sourceDirs =
  process.argv[2] === '--scan-dir'
    ? [path.resolve(process.argv[3])]
    : ['src/components', 'src/features', 'src/layout', 'src/routes', 'src/spa'].map((dir) =>
        path.join(root, dir),
      );
const extensions = /\.(?:ts|tsx|css|scss|less)$/;
const allowed =
  /^(?:inherit|cssVar\.fontFamily(?:Code)?|theme\.fontFamily(?:Code)?|var\(--(?:lobe|orvilo)-font-family(?:-code)?\))$/;
const intentionalMonospaceFiles = new Set([
  'src/components/FileParsingStatus/EmbeddingStatus.tsx',
  'src/components/FileParsingStatus/index.tsx',
  'src/features/Conversation/ChatList/components/AutoScroll/DebugInspector.tsx',
  'src/routes/(main)/agent/channel/detail/Footer.tsx',
  'src/features/Settings/creds/features/style.ts',
  'src/features/PluginDevModal/PluginPreview/ApiVisualizer.tsx',
  'src/features/Settings/system-tools/features/CliTestSection.tsx',
  'src/features/Auth/OAuthCallback/Error.tsx',
  'src/features/Auth/OAuthDevice/DeviceCodeInput.tsx',
  'src/features/Auth/OAuthDevice/DeviceCodeConfirm.tsx',
  'src/features/MCP/MCPInstallProgress/InstallError/ErrorDetails.tsx',
]);

function checkValue(file, position, raw) {
  const value = stripQuotes(
    raw
      .trim()
      .replace(/^\$\{([\s\S]*)\}$/, '$1')
      .trim(),
  );
  if (
    allowed.test(value) ||
    (nativeFontProducerVerified && /^(?:var\(--font-sans\)|var\(--font-mono\))$/.test(value)) ||
    ((value === 'monospace' || value === 'ui-monospace') && intentionalMonospaceFiles.has(file)) ||
    allowedByFile.get(file)?.some((pattern) => pattern.test(value))
  )
    return;
  findings.push(`${file}:${position} local font-family override: ${value}`);
}

function visitFile(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visitFile(absolute);
      continue;
    }
    if (!extensions.test(entry.name) || /\.(?:test|spec)\.[jt]sx?$/.test(entry.name)) continue;
    const file = path.relative(root, absolute).replaceAll('\\', '/');
    const text = readFileSync(absolute, 'utf8');
    const lineAt = (offset) => text.slice(0, offset).split('\n').length;

    // Scan CSS text, rather than TypeScript source, so `font: string` type
    // annotations cannot masquerade as CSS shorthand declarations.
    const scanCss = (css, sourceOffset) => {
      for (const match of css.matchAll(/(?:\b(?:font-family|font)|--font-(?:sans|mono))\s*:/gi)) {
        const start = match.index + match[0].length;
        // Tailwind arbitrary properties end at their matching square bracket,
        // not at the end of the complete class list. Keep scanning later ones.
        const arbitrary = css[match.index - 1] === '[';
        let end = start;
        let interpolationDepth = 0;
        let bracketDepth = arbitrary ? 1 : 0;
        let quote;
        while (end < css.length) {
          const char = css[end];
          if (char === '\\') {
            end += 2;
            continue;
          }
          if (quote) {
            if (char === quote) quote = undefined;
            end += 1;
            continue;
          }
          if (char === '"' || char === "'") {
            quote = char;
            end += 1;
            continue;
          }
          if (char === '$' && css[end + 1] === '{') {
            interpolationDepth += 1;
            end += 2;
            continue;
          }
          if (char === '}' && interpolationDepth > 0) {
            interpolationDepth -= 1;
          } else if (interpolationDepth === 0 && arbitrary && char === '[') {
            bracketDepth += 1;
          } else if (interpolationDepth === 0 && arbitrary && char === ']') {
            bracketDepth -= 1;
            if (bracketDepth === 0) break;
          } else if (interpolationDepth === 0 && !arbitrary && (char === ';' || char === '}')) {
            break;
          }
          end += 1;
        }
        if (match[0].startsWith('--font-')) {
          findings.push(
            `${file}:${lineAt(sourceOffset + match.index)} local native font role override: ${css.slice(start, end).trim()}`,
          );
        } else {
          checkValue(file, lineAt(sourceOffset + match.index), css.slice(start, end));
        }
      }
    };
    if (!/\.[jt]sx?$/.test(entry.name)) {
      scanCss(text, 0);
      continue;
    }
    const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const themeProviders = importedNames(parsed, '@lobehub/ui', 'ThemeProvider');
    const fontGenerators = importedNames(parsed, '@/const/font', 'genFontFamily');
    const isThemeFontToken = (node) => {
      if (
        node.name.getText(parsed).replaceAll(/["']/g, '') !== 'fontFamily' ||
        !ts.isCallExpression(node.initializer) ||
        !ts.isIdentifier(node.initializer.expression) ||
        !fontGenerators.has(node.initializer.expression.text)
      )
        return false;
      const token = node.parent.parent;
      if (!ts.isPropertyAssignment(token) || token.name.getText(parsed) !== 'token') return false;
      const expression = token.parent.parent;
      if (!ts.isJsxExpression(expression)) return false;
      const attribute = expression.parent;
      if (!ts.isJsxAttribute(attribute) || attribute.name.text !== 'theme') return false;
      const provider = attribute.parent.parent;
      return (
        (ts.isJsxOpeningElement(provider) || ts.isJsxSelfClosingElement(provider)) &&
        ts.isIdentifier(provider.tagName) &&
        themeProviders.has(provider.tagName.text)
      );
    };
    const walk = (node) => {
      if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        scanCss(node.getText(parsed).slice(1, -1), node.getStart(parsed) + 1);
      } else if (
        ts.isStringLiteral(node) &&
        /(?:\b(?:font-family|font)|--font-(?:sans|mono))\s*:/i.test(node.text)
      ) {
        scanCss(node.text, node.getStart(parsed) + 1);
      }
      if (
        ts.isPropertyAssignment(node) &&
        ['fontFamily', 'font'].includes(node.name.getText(parsed).replaceAll(/["']/g, '')) &&
        !isThemeFontToken(node)
      ) {
        checkValue(file, lineAt(node.getStart(parsed)), node.initializer.getText(parsed));
      }
      if (
        ts.isPropertyAssignment(node) &&
        ['--font-sans', '--font-mono'].includes(node.name.getText(parsed).replaceAll(/["']/g, ''))
      ) {
        findings.push(
          `${file}:${lineAt(node.getStart(parsed))} local native font role override: ${node.initializer.getText(parsed)}`,
        );
      }
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'setProperty' &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0]) &&
        ['--font-sans', '--font-mono'].includes(node.arguments[0].text)
      ) {
        findings.push(
          `${file}:${lineAt(node.getStart(parsed))} local native font role override: ${node.arguments[1]?.getText(parsed)}`,
        );
      }
      if (
        ts.isJsxAttribute(node) &&
        ['fontFamily', 'font'].includes(node.name.text) &&
        node.initializer &&
        !(
          nativeFontProducerVerified &&
          verifiedNativeFontSites.get(file)?.has(node.getStart(parsed))
        )
      ) {
        checkValue(file, lineAt(node.getStart(parsed)), node.initializer.getText(parsed));
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left) &&
        ['fontFamily', 'font'].includes(node.left.name.text)
      ) {
        checkValue(file, lineAt(node.getStart(parsed)), node.right.getText(parsed));
      }
      ts.forEachChild(node, walk);
    };
    walk(parsed);
  }
}

for (const dir of sourceDirs) visitFile(dir);
if (findings.length) {
  console.error(
    'Chinese UI font guard failed:\n' + findings.map((finding) => `  ${finding}`).join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log('Chinese UI font guard passed.');
}
