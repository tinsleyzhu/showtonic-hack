function inferMediaKind(contentType) {
  return contentType && contentType.startsWith("video/") ? "video" : "photo";
}

module.exports = {
  inferMediaKind,
};
