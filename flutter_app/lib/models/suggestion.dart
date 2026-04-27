class Suggestion {
  Suggestion({
    required this.id,
    required this.title,
    required this.description,
    required this.confidenceScore,
    required this.evidenceSummary,
    required this.suggestedSkill,
  });

  final String id;
  final String title;
  final String description;
  final double confidenceScore;
  final Map<String, dynamic> evidenceSummary;
  final Map<String, dynamic> suggestedSkill;

  factory Suggestion.fromJson(Map<String, dynamic> json) {
    return Suggestion(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Suggestion',
      description: json['description']?.toString() ?? '',
      confidenceScore: json['confidence_score'] is num
          ? (json['confidence_score'] as num).toDouble()
          : double.tryParse('${json['confidence_score'] ?? 0}') ?? 0,
      evidenceSummary: json['evidence_summary'] is Map
          ? Map<String, dynamic>.from(json['evidence_summary'] as Map)
          : const {},
      suggestedSkill: json['suggested_skill'] is Map
          ? Map<String, dynamic>.from(json['suggested_skill'] as Map)
          : const {},
    );
  }
}
