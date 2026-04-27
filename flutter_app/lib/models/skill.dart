class Skill {
  Skill({
    required this.id,
    required this.name,
    required this.description,
    required this.triggerType,
    required this.triggerValue,
    required this.actions,
    required this.isActive,
    required this.executionCount,
    this.lastExecuted,
  });

  final String id;
  final String name;
  final String description;
  final String triggerType;
  final String triggerValue;
  final List<dynamic> actions;
  final bool isActive;
  final int executionCount;
  final String? lastExecuted;

  factory Skill.fromJson(Map<String, dynamic> json) {
    return Skill(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Untitled Skill',
      description: json['description']?.toString() ?? '',
      triggerType: json['trigger_type']?.toString() ?? '',
      triggerValue: json['trigger_value']?.toString() ?? '',
      actions: json['actions'] is List ? json['actions'] as List<dynamic> : const [],
      isActive: json['is_active'] == true || json['is_active'] == 1,
      executionCount: json['execution_count'] is int
          ? json['execution_count'] as int
          : int.tryParse('${json['execution_count'] ?? 0}') ?? 0,
      lastExecuted: json['last_executed']?.toString(),
    );
  }
}
