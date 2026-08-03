function handler(event) {
  var uri = event.request.uri;
  if (uri === '/admin' || uri === '/booking/admin' || uri === '/admin/') {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: '/booking/admin/login' } }
    };
  }
  return event.request;
}
