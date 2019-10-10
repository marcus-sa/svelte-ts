import { findBestMatch } from 'string-similarity';
import * as ts from 'typescript';
import * as svelte from '@svelte-ts/common';

export function createIdentifierNotFoundDiagnostic(
  identifiers: string[],
  identifier: svelte.Identifier,
  sourceFile: ts.SourceFile,
): svelte.Diagnostic {
  const messages: string[] = [`Identifier '${identifier.name}' doesn't exist.`];

  const { bestMatch } = findBestMatch(
    identifier.name.toLowerCase(),
    identifiers,
  );

  if (bestMatch.rating >= 0.4) {
    messages.push(`Did you mean '${bestMatch.target}' instead?`);
  }

  return {
    category: ts.DiagnosticCategory.Error,
    start: identifier.start,
    length: identifier.end - identifier.start,
    messageText: svelte.formatDiagnosticMessageTexts(messages),
    code: identifier.type,
    file: sourceFile,
  };
}

export function createComponentTypesNotAssignableDiagnostic(
  identifier: svelte.Identifier,
  typeA: ts.Type,
  property: svelte.Attribute,
  component: ts.ClassDeclaration,
  typeB: ts.Type,
  sourceFile: ts.SourceFile,
  typeChecker: ts.TypeChecker,
): svelte.Diagnostic {
  const name = svelte.isAttributeShortHand(identifier.parent)
    ? 'Shorthand'
    : 'Variable';

  const messages = [
    `${name} '${identifier.name}' of type '${typeChecker.typeToString(
      typeA,
    )}' is not assignable to property '${
      property.name
    }' of type '${typeChecker.typeToString(typeB)}' on component '${
      component.name.escapedText
    }'.`,
  ];

  return {
    category: ts.DiagnosticCategory.Error,
    start: identifier.start,
    length: identifier.name.length,
    file: sourceFile,
    code: identifier.type,
    messageText: svelte.formatDiagnosticMessageTexts(messages),
  };
}

export function createNonExistentPropertyDiagnostic(
  properties: string[],
  property: svelte.Identifier | svelte.Attribute,
  component: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): svelte.Diagnostic {
  const { bestMatch } = findBestMatch(property.name.toLowerCase(), properties);
  const messages = [
    `Property '${property.name}' doesn't exist on '${component.name.escapedText}'.`,
  ];

  if (bestMatch.rating >= 0.4) {
    messages.push(`Did you mean '${bestMatch.target}' instead?`);
  }

  return {
    category: ts.DiagnosticCategory.Error,
    start: property.start,
    length: property.name.length,
    file: sourceFile,
    code: property.type,
    messageText: svelte.formatDiagnosticMessageTexts(messages),
  };
}
