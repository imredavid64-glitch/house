let profileHandler = null;
export function setProfileHandler(fn) {
  profileHandler = fn;
}
export function openProfile(userId) {
  if (profileHandler && userId) profileHandler(userId);
}