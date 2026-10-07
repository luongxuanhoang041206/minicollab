export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  };
}
