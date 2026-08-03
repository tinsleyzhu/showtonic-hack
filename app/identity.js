function selectIdentityForHandle(handle, identity) {
  if (handle && identity?.handle === handle) {
    return {
      user: identity.user ?? null,
      error: identity.error ?? "",
    };
  }
  return { user: null, error: "" };
}

export { selectIdentityForHandle };
