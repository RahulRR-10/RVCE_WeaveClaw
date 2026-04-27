import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_app/main.dart';

void main() {
  testWidgets('WeaveClaw shell shows four tabs', (WidgetTester tester) async {
    await tester.pumpWidget(const WeaveClawApp());

    expect(find.text('Chat'), findsOneWidget);
    expect(find.text('Skills'), findsOneWidget);
    expect(find.text('Suggestions'), findsOneWidget);
    expect(find.text('Hub'), findsOneWidget);
  });
}
