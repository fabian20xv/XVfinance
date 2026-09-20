/**
 * ESLint plugin: ban service-role secrets and admin APIs in chat/client code.
 */

const SERVICE_ROLE_IDENTIFIERS = new Set([
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SERVICE_ROLE_KEY',
  'getServiceRoleKey',
  'createServiceRoleClient',
]);

function propertyName(node) {
  if (!node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  if (node.property.type === 'Literal' && typeof node.property.value === 'string') {
    return node.property.value;
  }
  return null;
}

function isServerImport(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return (
    /(^|\/)server\//.test(value) ||
    /service-role(?:\.js)?$/.test(value) ||
    value.includes('/src/server/')
  );
}

const noServiceRoleInChat = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban service-role keys and server admin clients in chat tools and client bundles.',
    },
    schema: [],
    messages: {
      identifier:
        'Service-role identifier "{{name}}" is forbidden in chat tools and client bundles.',
      envAccess:
        'Do not read service-role env var "{{name}}" from chat tools or client bundles.',
      importPath:
        'Do not import server/service-role modules from chat tools or client bundles ({{source}}).',
      literal:
        'Service-role secret name "{{name}}" must not appear in chat tools or client bundles.',
    },
  },
  create(context) {
    return {
      Identifier(node) {
        if (SERVICE_ROLE_IDENTIFIERS.has(node.name)) {
          context.report({ node, messageId: 'identifier', data: { name: node.name } });
        }
      },
      Literal(node) {
        if (typeof node.value === 'string' && SERVICE_ROLE_IDENTIFIERS.has(node.value)) {
          context.report({ node, messageId: 'literal', data: { name: node.value } });
        }
      },
      MemberExpression(node) {
        const name = propertyName(node);
        if (name && SERVICE_ROLE_IDENTIFIERS.has(name)) {
          context.report({ node, messageId: 'envAccess', data: { name } });
        }
      },
      ImportDeclaration(node) {
        const source = node.source?.value;
        if (isServerImport(source)) {
          context.report({
            node: node.source,
            messageId: 'importPath',
            data: { source },
          });
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments[0]?.type === 'Literal' &&
          isServerImport(node.arguments[0].value)
        ) {
          context.report({
            node: node.arguments[0],
            messageId: 'importPath',
            data: { source: node.arguments[0].value },
          });
        }
      },
    };
  },
};

export default {
  meta: {
    name: 'xvfinance',
    version: '1.0.0',
  },
  rules: {
    'no-service-role-in-chat': noServiceRoleInChat,
  },
};
