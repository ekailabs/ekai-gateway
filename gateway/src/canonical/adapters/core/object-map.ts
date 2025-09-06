/**
 * Object mapping utilities for table-driven transformations
 * Provides lodash-like get/set functionality with dot notation
 */

/**
 * Get value from object using dot notation path
 * @param obj - Object to get value from
 * @param path - Dot notation path (e.g., 'user.profile.name')
 * @param defaultValue - Value to return if path not found
 */
export function get<T = any>(obj: any, path: string, defaultValue?: T): T | undefined {
  if (!obj || typeof obj !== 'object') {
    return defaultValue;
  }

  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current == null || typeof current !== 'object' || !(key in current)) {
      return defaultValue;
    }
    current = current[key];
  }

  return current;
}

/**
 * Set value in object using dot notation path
 * @param obj - Object to set value in (mutated)
 * @param path - Dot notation path (e.g., 'user.profile.name')
 * @param value - Value to set
 */
export function set(obj: any, path: string, value: any): void {
  if (!obj || typeof obj !== 'object') {
    return;
  }

  const keys = path.split('.');
  let current = obj;

  // Navigate to the parent of the target property
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }

  // Set the final value
  const finalKey = keys[keys.length - 1];
  current[finalKey] = value;
}

/**
 * Check if object has a property using dot notation path
 * @param obj - Object to check
 * @param path - Dot notation path
 */
export function has(obj: any, path: string): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current == null || typeof current !== 'object' || !(key in current)) {
      return false;
    }
    current = current[key];
  }

  return true;
}

/**
 * Remap object properties using a mapping table
 * @param source - Source object to remap
 * @param mapping - Mapping table { sourceKey: targetKey }
 * @param options - Additional options
 */
export function remap(
  source: any, 
  mapping: Record<string, string>,
  options: {
    skipUndefined?: boolean;
    allowOverwrite?: boolean;
  } = {}
): any {
  const { skipUndefined = true, allowOverwrite = true } = options;
  const target: any = {};

  for (const [sourcePath, targetPath] of Object.entries(mapping)) {
    const value = get(source, sourcePath);
    
    if (skipUndefined && value === undefined) {
      continue;
    }

    if (!allowOverwrite && has(target, targetPath)) {
      continue;
    }

    set(target, targetPath, value);
  }

  return target;
}

/**
 * Deep merge objects (for combining remapped results)
 * @param target - Target object (will be cloned, not mutated)
 * @param sources - Source objects to merge in
 */
export function merge(target: any, ...sources: any[]): any {
  if (!target || typeof target !== 'object') {
    return target;
  }
  
  // Clone target to avoid mutation
  const result = JSON.parse(JSON.stringify(target));

  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue;
    }

    for (const key in source) {
      if (!(key in source)) continue;

      const sourceValue = source[key];
      
      if (sourceValue === null || sourceValue === undefined) {
        result[key] = sourceValue;
      } else if (typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        // Deep merge objects
        if (!(key in result) || typeof result[key] !== 'object' || Array.isArray(result[key])) {
          result[key] = {};
        }
        result[key] = merge(result[key], sourceValue);
      } else {
        // Direct assignment for primitives and arrays
        result[key] = sourceValue;
      }
    }
  }

  return result;
}

/**
 * Remove undefined properties from object (clean up after remapping)
 * @param obj - Object to clean (mutated)
 * @param deep - Whether to clean nested objects
 */
export function removeUndefined(obj: any, deep = false): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  for (const key in obj) {
    if (!(key in obj)) continue;
    
    const value = obj[key];
    
    if (value === undefined) {
      delete obj[key];
    } else if (deep && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      removeUndefined(value, deep);
    }
  }

  return obj;
}

/**
 * Usage examples:
 * 
 * const source = { user: { profile: { name: 'John' } }, age: 30 };
 * 
 * // Basic get/set
 * get(source, 'user.profile.name'); // 'John'
 * set(source, 'user.profile.email', 'john@example.com');
 * 
 * // Table-driven remapping
 * const mapping = {
 *   'user.profile.name': 'fullName',
 *   'age': 'userAge'
 * };
 * const result = remap(source, mapping); // { fullName: 'John', userAge: 30 }
 * 
 * // Combine with additional properties
 * const final = merge(result, { id: '123', active: true });
 */