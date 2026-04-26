import 'package:flutter/material.dart';

class ConflictCard extends StatelessWidget {
  const ConflictCard({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.orange.shade50,
      child: ListTile(title: Text(message)),
    );
  }
}
