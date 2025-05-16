/**
 * User types for authentication and account management
 */

/**
 * Role information
 */
export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
}

/**
 * Base user interface with common properties
 */
export interface User {
  id: string;
  email: string;
  username: string;
  roleid: string;
  createdat: string;
  updatedat: string;
}

/**
 * User data as stored in the database
 * Includes sensitive fields like password hash
 */
export interface UserDB extends User {
  passwordhash: string;
  remembertoken?: string;
  lastloginat?: string;
}

/**
 * User data that's safe to send to the client
 * Excludes sensitive information
 */
export interface PublicUser {
  id: string;
  username: string;
  email: string;
  roleId: string;
  createdAt: number;
  lastLoginAt: number | null;
}

/**
 * Session token information
 */
export interface UserSession {
  userid: string;
  token: string;
  expiresat: number;
  isremembered: boolean;
}
