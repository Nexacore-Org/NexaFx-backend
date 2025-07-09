// Create test-hash.ts and run this to test your existing hash
import * as bcrypt from 'bcrypt';

async function testExistingHash() {
  const password = 'StrongPassword123!';
  const storedHash =
    '$2b$10$1qO3sdjvi68fa2tCxHWYeuNyu/CqrJAyFF2DrKZ9Rm6Qr41Hr6khq';

  console.log('=== Testing Existing Hash ===');
  console.log('Password:', password);
  console.log('Stored Hash:', storedHash);

  // Test 1: Try with current bcrypt version
  try {
    const result1 = await bcrypt.compare(password, storedHash);
    console.log('Current bcrypt.compare result:', result1);
  } catch (error) {
    console.error('Current bcrypt.compare error:', error);
  }

  // Test 2: Try to recreate the hash and compare
  try {
    console.log('\n=== Testing Hash Recreation ===');

    // Extract salt from existing hash
    const saltRounds = 10;
    const salt = storedHash.substring(0, 29); // Extract salt part
    console.log('Extracted salt:', salt);

    // Try to hash with explicit salt (if possible)
    const newHash1 = await bcrypt.hash(password, saltRounds);
    console.log('New hash with same rounds:', newHash1);

    const compareNew = await bcrypt.compare(password, newHash1);
    console.log('New hash comparison:', compareNew);
  } catch (error) {
    console.error('Hash recreation error:', error);
  }

  // Test 3: Try different approaches
  try {
    console.log('\n=== Alternative Tests ===');

    // Test if hash is corrupted by checking each character
    const hashChars = storedHash.split('');
    console.log('Hash character count:', hashChars.length);
    console.log('Hash ends with:', storedHash.slice(-10));

    // Test with a simple password to verify bcrypt works
    const simplePassword = 'test123';
    const simpleHash = await bcrypt.hash(simplePassword, 10);
    const simpleCompare = await bcrypt.compare(simplePassword, simpleHash);
    console.log('Simple test result:', simpleCompare);
  } catch (error) {
    console.error('Alternative test error:', error);
  }
}

testExistingHash().catch(console.error);

// Run with: npx ts-node test-hash.ts
