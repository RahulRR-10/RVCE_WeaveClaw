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

  Map<String, dynamic> toJson() => {
    'role': role,
    'content': content,
    'isError': isError,
    // payload intentionally omitted — it contains transient UI state
  };

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
    role: json['role']?.toString() ?? 'assistant',
    content: json['content']?.toString() ?? '',
    isError: json['isError'] == true,
  );
}
