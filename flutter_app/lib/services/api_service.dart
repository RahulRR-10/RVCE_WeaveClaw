import 'dart:convert';

import 'package:http/http.dart' as http;

class ApiService {
  static const String baseUrl = 'http://10.0.2.2:3000';

  static Future<Map<String, dynamic>> sendChat(
    String message,
    String sessionId,
  ) async {
    final res = await http.post(
      Uri.parse('$baseUrl/chat'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'message': message, 'session_id': sessionId}),
    );
    return _decodeMap(res);
  }

  static Future<List<Map<String, dynamic>>> getSkills() async {
    final res = await http.get(Uri.parse('$baseUrl/skills'));
    return _decodeList(res);
  }

  static Future<Map<String, dynamic>> executeSkill(String skillId) async {
    final res = await http.post(Uri.parse('$baseUrl/skills/$skillId/execute'));
    return _decodeOkMap(res);
  }

  static Future<Map<String, dynamic>> toggleSkill(String skillId) async {
    final res = await http.patch(Uri.parse('$baseUrl/skills/$skillId/toggle'));
    return _decodeOkMap(res);
  }

  static Future<void> deleteSkill(String skillId) async {
    final res = await http.delete(Uri.parse('$baseUrl/skills/$skillId'));
    _throwIfBad(res);
  }

  static Future<List<Map<String, dynamic>>> getExecutions(String skillId) async {
    final res = await http.get(Uri.parse('$baseUrl/skills/$skillId/executions'));
    return _decodeList(res);
  }

  static Future<List<Map<String, dynamic>>> getSuggestions() async {
    final res = await http.get(Uri.parse('$baseUrl/suggestions'));
    return _decodeList(res);
  }

  static Future<Map<String, dynamic>> acceptSuggestion(String id) async {
    final res = await http.post(Uri.parse('$baseUrl/suggestions/$id/accept'));
    return _decodeOkMap(res);
  }

  static Future<Map<String, dynamic>> dismissSuggestion(String id) async {
    final res = await http.post(Uri.parse('$baseUrl/suggestions/$id/dismiss'));
    return _decodeOkMap(res);
  }

  static Future<List<Map<String, dynamic>>> getDevices() async {
    final res = await http.get(Uri.parse('$baseUrl/devices'));
    return _decodeList(res);
  }

  static Future<Map<String, dynamic>> importHubSkill(
    Map<String, dynamic> skill,
  ) async {
    final res = await http.post(
      Uri.parse('$baseUrl/skills'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(skill),
    );
    return _decodeMap(res);
  }

  static Future<Map<String, dynamic>> resolveConflict({
    required Map<String, dynamic> newSkill,
    required String conflictingId,
    required String resolution,
    String? conflictType,
  }) async {
    final payload = <String, dynamic>{
      'new_skill': newSkill,
      'conflicting_skill_id': conflictingId,
      'resolution': resolution,
      if (conflictType != null) 'conflict_type': conflictType,
    };
    final res = await http.post(
      Uri.parse('$baseUrl/conflicts/resolve'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );
    return _decodeOkMap(res);
  }

  static List<Map<String, dynamic>> _decodeList(http.Response res) {
    _throwIfBad(res);
    final decoded = jsonDecode(res.body);
    if (decoded is List) {
      return decoded
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    throw ApiException(res.statusCode, 'Expected a list response');
  }

  static Map<String, dynamic> _decodeMap(http.Response res) {
    final decoded = res.body.isEmpty ? <String, dynamic>{} : jsonDecode(res.body);
    final map = decoded is Map
        ? Map<String, dynamic>.from(decoded)
        : <String, dynamic>{'value': decoded};
    map['status_code'] = res.statusCode;
    return map;
  }

  static Map<String, dynamic> _decodeOkMap(http.Response res) {
    final map = _decodeMap(res);
    if (res.statusCode >= 200 && res.statusCode < 300) return map;
    final message = map['message']?.toString() ??
        map['error']?.toString() ??
        'Request failed with status ${res.statusCode}';
    throw ApiException(res.statusCode, message);
  }

  static void _throwIfBad(http.Response res) {
    if (res.statusCode >= 200 && res.statusCode < 300) return;
    String message = 'Request failed with status ${res.statusCode}';
    try {
      final decoded = jsonDecode(res.body);
      if (decoded is Map && decoded['error'] != null) {
        message = decoded['error'].toString();
      }
    } catch (_) {
      if (res.body.isNotEmpty) message = res.body;
    }
    throw ApiException(res.statusCode, message);
  }
}

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => message;
}
