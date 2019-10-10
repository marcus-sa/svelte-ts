import {
  formatDiagnosticMessageTexts,
  SvelteDiagnostic,
} from '@svelte-ts/common';
import { findBestMatch } from 'string-similarity';
import * as ts from 'typescript';

import { Attribute, Identifier } from './interfaces';
import { log } from '@bazel/typescript';
import { isAttributeShortHand } from '@svelte-ts/type-checker';

export function createIdentifierNotFoundDiagnostic(
  identifiers: string[],
  identifier: Identifier,
  sourceFile: ts.SourceFile,
): SvelteDiagnostic {
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
    messageText: formatDiagnosticMessageTexts(messages),
    code: identifier.type,
    file: sourceFile,
  };
}

export function createComponentTypesNotAssignableDiagnostic(
  identifier: Identifier,
  typeA: ts.Type,
  property: Attribute,
  component: ts.ClassDeclaration,
  typeB: ts.Type,
  sourceFile: ts.SourceFile,
  typeChecker: ts.TypeChecker,
): SvelteDiagnostic {
  const name = isAttributeShortHand(identifier.parent)
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
    messageText: formatDiagnosticMessageTexts(messages),
  };
}

export function createAttributeNonExistentDiagnostic(
  attributes: string[],
  attribute: Identifier | Attribute,
  component: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): SvelteDiagnostic {
  const { bestMatch } = findBestMatch(attribute.name.toLowerCase(), attributes);
  const messages = [
    `Attribute '${attribute.name}' doesn't exist on '${component.name.escapedText}'.`,
  ];

  if (bestMatch.rating >= 0.4) {
    messages.push(`Did you mean '${bestMatch.target}' instead?`);
  }

  return {
    category: ts.DiagnosticCategory.Error,
    start: attribute.start,
    length: attribute.name.length,
    file: sourceFile,
    code: attribute.type,
    messageText: formatDiagnosticMessageTexts(messages),
  };
}
