import * as ddb from '../../../aws-dynamodb';
import * as sfn from '../../../aws-stepfunctions';
import * as cdk from '../../../core';
import * as tasks from '../../lib';

let stack: cdk.Stack;
let table: ddb.Table;

beforeEach(() => {
  // GIVEN
  stack = new cdk.Stack();
  table = new ddb.Table(stack, 'my-table', {
    tableName: 'my-table',
    partitionKey: {
      name: 'name',
      type: ddb.AttributeType.STRING,
    },
  });
});

test('DeleteItem task', () => {
  // WHEN
  const task = new tasks.DynamoDeleteItem(stack, 'DeleteItem', {
    key: { SOME_KEY: tasks.DynamoAttributeValue.fromString('1234') },
    table,
    conditionExpression: 'ForumName <> :f and Subject <> :s',
    expressionAttributeNames: { OTHER_KEY: '#OK' },
    expressionAttributeValues: {
      ':val': tasks.DynamoAttributeValue.numberFromString(sfn.JsonPath.stringAt('$.Item.TotalCount.N')),
    },
    returnConsumedCapacity: tasks.DynamoConsumedCapacity.TOTAL,
    returnItemCollectionMetrics: tasks.DynamoItemCollectionMetrics.SIZE,
    returnValues: tasks.DynamoReturnValues.ALL_NEW,
  });

  // THEN
  expect(stack.resolve(task.toStateJson())).toEqual({
    Type: 'Task',
    Resource: {
      'Fn::Join': [
        '',
        [
          'arn:',
          {
            Ref: 'AWS::Partition',
          },
          ':states:::dynamodb:deleteItem',
        ],
      ],
    },
    End: true,
    Parameters: {
      Key: { SOME_KEY: { S: '1234' } },
      TableName: {
        Ref: 'mytable0324D45C',
      },
      ConditionExpression: 'ForumName <> :f and Subject <> :s',
      ExpressionAttributeNames: { OTHER_KEY: '#OK' },
      ExpressionAttributeValues: { ':val': { 'N.$': '$.Item.TotalCount.N' } },
      ReturnConsumedCapacity: 'TOTAL',
      ReturnItemCollectionMetrics: 'SIZE',
      ReturnValues: 'ALL_NEW',
    },
  });
});

test('DeleteItem task - using JSONata', () => {
  // WHEN
  const task = tasks.DynamoDeleteItem.jsonata(stack, 'DeleteItem', {
    key: { SOME_KEY: tasks.DynamoAttributeValue.fromString('1234') },
    table,
    conditionExpression: 'ForumName <> :f and Subject <> :s',
    expressionAttributeNames: { OTHER_KEY: '#OK' },
    expressionAttributeValues: {
      ':val': tasks.DynamoAttributeValue.numberFromString('{% $Item.TotalCount.N %}'),
    },
    returnConsumedCapacity: tasks.DynamoConsumedCapacity.TOTAL,
    returnItemCollectionMetrics: tasks.DynamoItemCollectionMetrics.SIZE,
    returnValues: tasks.DynamoReturnValues.ALL_NEW,
  });

  // THEN
  expect(stack.resolve(task.toStateJson())).toEqual({
    Type: 'Task',
    QueryLanguage: 'JSONata',
    Resource: {
      'Fn::Join': [
        '',
        [
          'arn:',
          {
            Ref: 'AWS::Partition',
          },
          ':states:::dynamodb:deleteItem',
        ],
      ],
    },
    End: true,
    Arguments: {
      Key: { SOME_KEY: { S: '1234' } },
      TableName: {
        Ref: 'mytable0324D45C',
      },
      ConditionExpression: 'ForumName <> :f and Subject <> :s',
      ExpressionAttributeNames: { OTHER_KEY: '#OK' },
      ExpressionAttributeValues: { ':val': { N: '{% $Item.TotalCount.N %}' } },
      ReturnConsumedCapacity: 'TOTAL',
      ReturnItemCollectionMetrics: 'SIZE',
      ReturnValues: 'ALL_NEW',
    },
  });
});
