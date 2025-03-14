import { Template } from '../../assertions';
import { Stack } from '../../core';
import { UserPool, UserPoolResourceServer } from '../lib';

describe('User Pool Resource Server', () => {
  test('default setup', () => {
    // GIVEN
    const stack = new Stack();
    const pool = new UserPool(stack, 'Pool');

    // WHEN
    new UserPoolResourceServer(stack, 'Server', {
      userPool: pool,
      identifier: 'users',
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::Cognito::UserPoolResourceServer', {
      Identifier: 'users',
      Name: 'users',
      UserPoolId: stack.resolve(pool.userPoolId),
    });
  });

  test('can assign a custom name', () => {
    // GIVEN
    const stack = new Stack();
    const pool = new UserPool(stack, 'Pool');

    // WHEN
    new UserPoolResourceServer(stack, 'Server', {
      userPoolResourceServerName: 'internal-users',
      userPool: pool,
      identifier: 'users',
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::Cognito::UserPoolResourceServer', {
      Identifier: 'users',
      Name: 'internal-users',
    });
  });

  test('can assign scopes', () => {
    // GIVEN
    const stack = new Stack();
    const pool = new UserPool(stack, 'Pool');

    // WHEN
    new UserPoolResourceServer(stack, 'Server', {
      userPool: pool,
      identifier: 'users',
      scopes: [
        {
          scopeName: 'read',
          scopeDescription: 'read only access',
        },
      ],
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::Cognito::UserPoolResourceServer', {
      Scopes: [
        {
          ScopeDescription: 'read only access',
          ScopeName: 'read',
        },
      ],
    });
  });
});
