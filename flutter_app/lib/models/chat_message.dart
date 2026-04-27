class ChatMessage {
  ChatMessage({
    required this.role,
    required this.content,
    this.payload,
    this.isError = false,
  });

  final String role;
  final String content;
  final Map<String, dynamic>? payload;
  final bool isError;
}
