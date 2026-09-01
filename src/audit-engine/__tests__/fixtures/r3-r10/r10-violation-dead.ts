// R10 VIOLATION — must FIRE: dead enforcement function with zero call sites, not framework-invoked, not test-only, no dynamic access (FORENSIC §2.7)
function checkPermissions(user: string): boolean { return user === 'admin'; }
function verifyEnforcement(token: string): boolean { return token.length > 0; }
