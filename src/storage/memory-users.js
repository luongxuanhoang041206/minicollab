import { randomUUID } from 'node:crypto';

export class DuplicateEmailError extends Error {
  constructor(email) {
    super('Email đã tồn tại');
    this.name = 'DuplicateEmailError';
    this.email = email;
  }
}

function normalizeEmail(email) {
  if (typeof email !== 'string') {
    throw new TypeError('email phải là chuỗi');
  }

  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new TypeError('email không được để trống');
  }
  return normalized;
}

function copyUser(user) {
  if (!user) return null;
  return {
    ...user,
    createdAt: new Date(user.createdAt),
  };
}

export function createMemoryUserStore() {
  const byId = new Map();
  const idByEmail = new Map();

  return {
    async create({ email, passwordHash }) {
      const normalizedEmail = normalizeEmail(email);
      if (typeof passwordHash !== 'string' || passwordHash.length === 0) {
        throw new TypeError('passwordHash không được để trống');
      }

      if (idByEmail.has(normalizedEmail)) {
        throw new DuplicateEmailError(normalizedEmail);
      }

      const user = {
        id: randomUUID(),
        email: normalizedEmail,
        passwordHash,
        createdAt: new Date(),
      };

      byId.set(user.id, user);
      idByEmail.set(normalizedEmail, user.id);
      return copyUser(user);
    },

    async findByEmail(email) {
      const normalizedEmail = normalizeEmail(email);
      const id = idByEmail.get(normalizedEmail);
      return copyUser(id === undefined ? null : byId.get(id));
    },

    async findById(id) {
      if (typeof id !== 'string') return null;
      return copyUser(byId.get(id) ?? null);
    },
  };
}