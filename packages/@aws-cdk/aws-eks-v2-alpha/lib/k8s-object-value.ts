import { Construct } from 'constructs';
import { ICluster } from './cluster';
import { KubectlProvider } from './kubectl-provider';
import { CustomResource, Token, Duration } from 'aws-cdk-lib/core';

/**
 * Properties for KubernetesObjectValue.
 */
export interface KubernetesObjectValueProps {
  /**
   * The EKS cluster to fetch attributes from.
   *
   * [disable-awslint:ref-via-interface]
   */
  readonly cluster: ICluster;

  /**
   * The object type to query. (e.g 'service', 'pod'...)
   */
  readonly objectType: string;

  /**
   * The name of the object to query.
   */
  readonly objectName: string;

  /**
   * The namespace the object belongs to.
   *
   * @default 'default'
   */
  readonly objectNamespace?: string;

  /**
   * JSONPath to the specific value.
   *
   * @see https://kubernetes.io/docs/reference/kubectl/jsonpath/
   */
  readonly jsonPath: string;

  /**
   * Timeout for waiting on a value.
   *
   * @default Duration.minutes(5)
   */
  readonly timeout?: Duration;

}

/**
 * Represents a value of a specific object deployed in the cluster.
 * Use this to fetch any information available by the `kubectl get` command.
 */
export class KubernetesObjectValue extends Construct {
  /**
   * The CloudFormation resource type.
   */
  public static readonly RESOURCE_TYPE = 'Custom::AWSCDK-EKS-KubernetesObjectValue';

  private _resource: CustomResource;

  constructor(scope: Construct, id: string, props: KubernetesObjectValueProps) {
    super(scope, id);

    const provider = KubectlProvider.getKubectlProvider(this, props.cluster);

    if (!provider) {
      throw new Error('Kubectl Provider is not defined in this cluster. Define it when creating the cluster');
    }

    this._resource = new CustomResource(this, 'Resource', {
      resourceType: KubernetesObjectValue.RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        ClusterName: props.cluster.clusterName,
        ObjectType: props.objectType,
        ObjectName: props.objectName,
        ObjectNamespace: props.objectNamespace ?? 'default',
        JsonPath: props.jsonPath,
        TimeoutSeconds: (props?.timeout ?? Duration.minutes(5)).toSeconds(),
      },
    });
  }

  /**
   * The value as a string token.
   */
  public get value(): string {
    return Token.asString(this._resource.getAtt('Value'));
  }
}
