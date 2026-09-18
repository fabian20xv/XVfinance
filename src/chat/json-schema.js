/**
 * Minimal JSON Schema subset for chat tool arguments.
 * Supports type, properties, required, additionalProperties, enum.
 */

/**
 * @param {object} schema
 * @param {unknown} data
 * @returns {{ ok: true, value: unknown } | { ok: false, errors: string[] }}
 */
export function validateAgainstSchema(schema, data) {
  if (!schema || typeof schema !== 'object') {
    return { ok: false, errors: ['Tool JSON Schema is missing'] };
  }
  const errors = [];
  visit(schema, data, '$', errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: data };
}

function visit(schema, data, path, errors) {
  if (schema.type === 'object') {
    if (data == null || typeof data !== 'object' || Array.isArray(data)) {
      errors.push(`${path} must be an object`);
      return;
    }
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(data, key) || data[key] === undefined) {
        errors.push(`${path}.${key} is required`);
      }
    }
    const properties = schema.properties ?? {};
    for (const [key, value] of Object.entries(data)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        if (schema.additionalProperties === false) {
          errors.push(`${path}.${key} is not allowed`);
        }
        continue;
      }
      visit(properties[key], value, `${path}.${key}`, errors);
    }
    return;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(data)) {
      errors.push(`${path} must be an array`);
      return;
    }
    if (schema.items) {
      data.forEach((item, index) => visit(schema.items, item, `${path}[${index}]`, errors));
    }
    return;
  }

  if (schema.type === 'string' && typeof data !== 'string') {
    errors.push(`${path} must be a string`);
  } else if (schema.type === 'number' && typeof data !== 'number') {
    errors.push(`${path} must be a number`);
  } else if (schema.type === 'boolean' && typeof data !== 'boolean') {
    errors.push(`${path} must be a boolean`);
  } else if (schema.type === 'null' && data !== null) {
    errors.push(`${path} must be null`);
  }

  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(`${path} must be one of: ${schema.enum.join(', ')}`);
  }
}
