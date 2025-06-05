import { ethers } from 'ethers';
import { BadRequestException } from '@nestjs/common';

export class SignatureVerificationUtil {
  /**
   * Verify that a signature was created by the owner of the given address
   */
  static async verifySignature(
    address: string,
    message: string,
    signature: string,
  ): Promise<boolean> {
    try {
      // Recover the address from the signature
      const recoveredAddress = ethers.utils.verifyMessage(message, signature);
      
      // Compare addresses (case-insensitive)
      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch (error) {
      throw new BadRequestException('Invalid signature format');
    }
  }

  /**
   * Generate a verification message with timestamp
   */
  static generateVerificationMessage(userId: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    return `I am linking this wallet to my account.\nUser ID: ${userId}\nTimestamp: ${timestamp}`;
  }

  /**
   * Validate that the message contains the expected user ID and is recent
   */
  static validateMessage(message: string, userId: string): boolean {
    const lines = message.split('\n');
    
    if (lines.length !== 3) {
      return false;
    }

    // Check if message contains correct user ID
    const userIdLine = lines[1];
    if (!userIdLine.includes(userId)) {
      return false;
    }

    // Check if timestamp is recent (within 10 minutes)
    const timestampLine = lines[2];
    const timestampMatch = timestampLine.match(/Timestamp: (\d+)/);
    
    if (!timestampMatch) {
      return false;
    }

    const messageTimestamp = parseInt(timestampMatch[1]);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const timeDifference = currentTimestamp - messageTimestamp;

    // Message should be signed within the last 10 minutes
    return timeDifference <= 600;
  }
}