/**
 * Client and Shared Form Validation Helpers
 * Provides clear, actionable error messages for frontend forms.
 */

export const VALIDATION_PATTERNS = {
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  phone: /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/,
};

/**
 * Validates a required text field.
 */
export function validateRequired(value, fieldName = 'This field') {
  if (value === undefined || value === null || String(value).trim() === '') {
    return `${fieldName} is required.`;
  }
  return null;
}

/**
 * Validates email format.
 */
export function validateEmail(email, fieldName = 'Email address') {
  const reqError = validateRequired(email, fieldName);
  if (reqError) return reqError;

  if (!VALIDATION_PATTERNS.email.test(String(email).trim())) {
    return `Please enter a valid email address (e.g., name@company.com).`;
  }
  return null;
}

/**
 * Validates phone format (optional or required).
 */
export function validatePhone(phone, required = false, fieldName = 'Phone number') {
  if (!phone || String(phone).trim() === '') {
    if (required) return `${fieldName} is required.`;
    return null;
  }

  const clean = String(phone).trim().replace(/[\s\-\(\)]/g, '');
  if (clean.length < 7 || clean.length > 15 || !/^[+]?[0-9]+$/.test(clean)) {
    return `Please enter a valid phone number (7-15 digits).`;
  }
  return null;
}

/**
 * Validates positive number / currency amount.
 */
export function validatePositiveNumber(value, fieldName = 'Amount', allowZero = false) {
  const reqError = validateRequired(value, fieldName);
  if (reqError) return reqError;

  const num = Number(value);
  if (isNaN(num)) {
    return `${fieldName} must be a valid number.`;
  }

  if (allowZero ? num < 0 : num <= 0) {
    return `${fieldName} must be greater than ${allowZero ? 'or equal to ' : ''}zero.`;
  }

  return null;
}

/**
 * Validates a date string.
 */
export function validateDate(value, fieldName = 'Date') {
  const reqError = validateRequired(value, fieldName);
  if (reqError) return reqError;

  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return `Please enter a valid date for ${fieldName}.`;
  }

  return null;
}

/**
 * Validates start date is before or equal to end date.
 */
export function validateDateRange(startDate, endDate, startName = 'Start date', endName = 'End date') {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end < start) {
    return `${endName} cannot be earlier than ${startName}.`;
  }

  return null;
}

/**
 * Batch validator for form state.
 * @param {Object} formData
 * @param {Object} rules - Map of fieldName -> validator function(value, allData) returning error string or null
 * @returns {{ isValid: boolean, errors: Record<string, string> }}
 */
export function validateForm(formData, rules) {
  const errors = {};
  let isValid = true;

  for (const [field, validator] of Object.entries(rules)) {
    if (typeof validator === 'function') {
      const error = validator(formData[field], formData);
      if (error) {
        errors[field] = error;
        isValid = false;
      }
    }
  }

  return { isValid, errors };
}
