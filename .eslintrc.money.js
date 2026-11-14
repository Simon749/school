module.exports = {
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.name="Number"][arguments.length=1]',
        message:
          'Do not use Number() for money values. Use Prisma.Decimal or the money/decimal utility.',
      },
      {
        selector: 'BinaryExpression[operator="+"][left.type="Identifier"][right.type="Identifier"]',
        message: 'Do not use + for money arithmetic. Use add() from money/decimal.',
      },
      {
        selector: 'BinaryExpression[operator="-"][left.type="Identifier"][right.type="Identifier"]',
        message: 'Do not use - for money arithmetic. Use subtract() from money/decimal.',
      },
    ],
  },
};
