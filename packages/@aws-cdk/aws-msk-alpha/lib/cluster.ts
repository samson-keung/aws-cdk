import * as acmpca from 'aws-cdk-lib/aws-acmpca';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as core from 'aws-cdk-lib/core';
import { FeatureFlags } from 'aws-cdk-lib/core';
import * as cr from 'aws-cdk-lib/custom-resources';
import { S3_CREATE_DEFAULT_LOGGING_POLICY } from 'aws-cdk-lib/cx-api';
import * as constructs from 'constructs';
import { addressOf } from 'constructs/lib/private/uniqueid';
import { KafkaVersion } from './';
import { CfnCluster } from 'aws-cdk-lib/aws-msk';
import { addConstructMetadata, MethodMetadata } from 'aws-cdk-lib/core/lib/metadata-resource';
import { propertyInjectable } from 'aws-cdk-lib/core/lib/prop-injectable';

/**
 * Represents a MSK Cluster
 */
export interface ICluster extends core.IResource, ec2.IConnectable {
  /**
   * The ARN of cluster.
   *
   * @attribute
   */
  readonly clusterArn: string;

  /**
   * The physical name of the cluster.
   *
   * @attribute
   */
  readonly clusterName: string;
}

/**
 * A new or imported MSK Cluster.
 */
export abstract class ClusterBase extends core.Resource implements ICluster {
  public abstract readonly clusterArn: string;
  public abstract readonly clusterName: string;
  /** @internal */
  protected _connections: ec2.Connections | undefined;

  /** Manages connections for the cluster */
  public get connections(): ec2.Connections {
    if (!this._connections) {
      throw new core.ValidationError('An imported Cluster cannot manage its security groups', this);
    }
    return this._connections;
  }
}

/**
 *  Properties for a MSK Cluster
 */
export interface ClusterProps {
  /**
   * The physical name of the cluster.
   */
  readonly clusterName: string;

  /**
   * The version of Apache Kafka.
   */
  readonly kafkaVersion: KafkaVersion;

  /**
   * Number of Apache Kafka brokers deployed in each Availability Zone.
   *
   * @default 1
   */
  readonly numberOfBrokerNodes?: number;

  /**
   * Defines the virtual networking environment for this cluster.
   * Must have at least 2 subnets in two different AZs.
   */
  readonly vpc: ec2.IVpc;

  /**
   * Where to place the nodes within the VPC.
   * Amazon MSK distributes the broker nodes evenly across the subnets that you specify.
   * The subnets that you specify must be in distinct Availability Zones.
   * Client subnets can't be in Availability Zone us-east-1e.
   *
   * @default - the Vpc default strategy if not specified.
   */
  readonly vpcSubnets?: ec2.SubnetSelection;

  /**
   * The EC2 instance type that you want Amazon MSK to use when it creates your brokers.
   *
   * @see https://docs.aws.amazon.com/msk/latest/developerguide/msk-create-cluster.html#broker-instance-types
   * @default kafka.m5.large
   */
  readonly instanceType?: ec2.InstanceType;

  /**
   * The AWS security groups to associate with the elastic network interfaces in order to specify who can
   * connect to and communicate with the Amazon MSK cluster.
   *
   * @default - create new security group
   */
  readonly securityGroups?: ec2.ISecurityGroup[];

  /**
   * Information about storage volumes attached to MSK broker nodes.
   *
   * @default - 1000 GiB EBS volume
   */
  readonly ebsStorageInfo?: EbsStorageInfo;

  /**
   * This controls storage mode for supported storage tiers.
   *
   * @default - StorageMode.LOCAL
   * @see https://docs.aws.amazon.com/msk/latest/developerguide/msk-tiered-storage.html
   */
  readonly storageMode?: StorageMode;

  /**
   * The Amazon MSK configuration to use for the cluster.
   *
   * @default - none
   */
  readonly configurationInfo?: ClusterConfigurationInfo;

  /**
   * Cluster monitoring configuration.
   *
   * @default - DEFAULT monitoring level
   */
  readonly monitoring?: MonitoringConfiguration;

  /**
   * Configure your MSK cluster to send broker logs to different destination types.
   *
   * @default - disabled
   */
  readonly logging?: BrokerLogging;

  /**
   * Config details for encryption in transit.
   *
   * @default - enabled
   */
  readonly encryptionInTransit?: EncryptionInTransitConfig;

  /**
   * Configuration properties for client authentication.
   * MSK supports using private TLS certificates or SASL/SCRAM to authenticate the identity of clients.
   *
   * @default - disabled
   */
  readonly clientAuthentication?: ClientAuthentication;

  /**
   * What to do when this resource is deleted from a stack.
   *
   * @default RemovalPolicy.RETAIN
   */
  readonly removalPolicy?: core.RemovalPolicy;
}

/**
 * EBS volume information.
 */
export interface EbsStorageInfo {
  /**
   * The size in GiB of the EBS volume for the data drive on each broker node.
   *
   * @default 1000
   */
  readonly volumeSize?: number;

  /**
   * The AWS KMS key for encrypting data at rest.
   *
   * @default Uses AWS managed CMK (aws/kafka)
   */
  readonly encryptionKey?: kms.IKey;
}

/**
 * The storage mode for the cluster brokers.
 */
export enum StorageMode {
  /**
   * Local storage mode utilizes network attached EBS storage.
   */
  LOCAL = 'LOCAL',

  /**
   * Tiered storage mode utilizes EBS storage and Tiered storage.
   */
  TIERED = 'TIERED',
}

/**
 * The Amazon MSK configuration to use for the cluster.
 * Note: There is currently no Cloudformation Resource to create a Configuration
 */
export interface ClusterConfigurationInfo {
  /**
   * The Amazon Resource Name (ARN) of the MSK configuration to use.
   * For example, arn:aws:kafka:us-east-1:123456789012:configuration/example-configuration-name/abcdabcd-1234-abcd-1234-abcd123e8e8e-1.
   */
  readonly arn: string;

  /**
   * The revision of the Amazon MSK configuration to use.
   */
  readonly revision: number;
}

/**
 * The level of monitoring for the MSK cluster
 *
 * @see https://docs.aws.amazon.com/msk/latest/developerguide/monitoring.html#metrics-details
 */
export enum ClusterMonitoringLevel {
  /**
   * Default metrics are the essential metrics to monitor.
   */
  DEFAULT = 'DEFAULT',

  /**
   * Per Broker metrics give you metrics at the broker level.
   */
  PER_BROKER = 'PER_BROKER',

  /**
   * Per Topic Per Broker metrics help you understand volume at the topic level.
   */
  PER_TOPIC_PER_BROKER = 'PER_TOPIC_PER_BROKER',

  /**
   * Per Topic Per Partition metrics help you understand consumer group lag at the topic partition level.
   */
  PER_TOPIC_PER_PARTITION = 'PER_TOPIC_PER_PARTITION',
}

/**
 * Monitoring Configuration
 */
export interface MonitoringConfiguration {
  /**
   * Specifies the level of monitoring for the MSK cluster.
   *
   * @default DEFAULT
   */
  readonly clusterMonitoringLevel?: ClusterMonitoringLevel;

  /**
   * Indicates whether you want to enable or disable the JMX Exporter.
   *
   * @default false
   */
  readonly enablePrometheusJmxExporter?: boolean;

  /**
   * Indicates whether you want to enable or disable the Prometheus Node Exporter.
   *
   * You can use the Prometheus Node Exporter to get CPU and disk metrics for the broker nodes.
   *
   * @default false
   */
  readonly enablePrometheusNodeExporter?: boolean;
}

/**
 * Configuration details related to broker logs.
 */
export interface BrokerLogging {
  /**
   * The Amazon Data Firehose delivery stream that is the destination for broker logs.
   *
   * @default - disabled
   */
  readonly firehoseDeliveryStreamName?: string;

  /**
   * The CloudWatch Logs group that is the destination for broker logs.
   *
   * @default - disabled
   */
  readonly cloudwatchLogGroup?: logs.ILogGroup;

  /**
   * Details of the Amazon S3 destination for broker logs.
   *
   * @default - disabled
   */
  readonly s3?: S3LoggingConfiguration;
}

/**
 * Details of the Amazon S3 destination for broker logs.
 */
export interface S3LoggingConfiguration {
  /**
   * The S3 bucket that is the destination for broker logs.
   */
  readonly bucket: s3.IBucket;

  /**
   * The S3 prefix that is the destination for broker logs.
   *
   * @default - no prefix
   */
  readonly prefix?: string;
}

/**
 * Indicates the encryption setting for data in transit between clients and brokers.
 */
export enum ClientBrokerEncryption {
  /**
   * TLS means that client-broker communication is enabled with TLS only.
   */
  TLS = 'TLS',

  /**
   * TLS_PLAINTEXT means that client-broker communication is enabled for both TLS-encrypted, as well as plaintext data.
   */
  TLS_PLAINTEXT = 'TLS_PLAINTEXT',

  /**
   * PLAINTEXT means that client-broker communication is enabled in plaintext only.
   */
  PLAINTEXT = 'PLAINTEXT',
}

/**
 * The settings for encrypting data in transit.
 *
 * @see https://docs.aws.amazon.com/msk/latest/developerguide/msk-encryption.html#msk-encryption-in-transit
 */
export interface EncryptionInTransitConfig {
  /**
   * Indicates the encryption setting for data in transit between clients and brokers.
   *
   * @default - TLS
   */
  readonly clientBroker?: ClientBrokerEncryption;

  /**
   * Indicates that data communication among the broker nodes of the cluster is encrypted.
   *
   * @default true
   */
  readonly enableInCluster?: boolean;
}

/**
 * SASL authentication properties
 */
export interface SaslAuthProps {
  /**
   * Enable SASL/SCRAM authentication.
   *
   * @default false
   */
  readonly scram?: boolean;

  /**
   * Enable IAM access control.
   *
   * @default false
   */
  readonly iam?: boolean;

  /**
   * KMS Key to encrypt SASL/SCRAM secrets.
   *
   * You must use a customer master key (CMK) when creating users in secrets manager.
   * You cannot use a Secret with Amazon MSK that uses the default Secrets Manager encryption key.
   *
   * @default - CMK will be created with alias msk/{clusterName}/sasl/scram
   */
  readonly key?: kms.IKey;
}

/**
 * TLS authentication properties
 */
export interface TlsAuthProps {
  /**
   * List of ACM Certificate Authorities to enable TLS authentication.
   *
   * @default - none
   */
  readonly certificateAuthorities?: acmpca.ICertificateAuthority[];
}

/**
 * SASL + TLS authentication properties
 */
export interface SaslTlsAuthProps extends SaslAuthProps, TlsAuthProps { }

/**
 * Configuration properties for client authentication.
 */
export class ClientAuthentication {
  /**
   * SASL authentication
   */
  public static sasl(props: SaslAuthProps): ClientAuthentication {
    return new ClientAuthentication(props, undefined);
  }

  /**
   * TLS authentication
   */
  public static tls(props: TlsAuthProps): ClientAuthentication {
    return new ClientAuthentication(undefined, props);
  }

  /**
   * SASL + TLS authentication
   */
  public static saslTls(saslTlsProps: SaslTlsAuthProps): ClientAuthentication {
    return new ClientAuthentication(saslTlsProps, saslTlsProps);
  }

  /**
   * @param saslProps - properties for SASL authentication
   * @param tlsProps - properties for TLS authentication
   */
  private constructor(
    public readonly saslProps?: SaslAuthProps,
    public readonly tlsProps?: TlsAuthProps,
  ) {}
}

/**
 * Create a MSK Cluster.
 *
 * @resource AWS::MSK::Cluster
 */
@propertyInjectable
export class Cluster extends ClusterBase {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = '@aws-cdk.aws-msk-alpha.Cluster';

  /**
   * Reference an existing cluster, defined outside of the CDK code, by name.
   */
  public static fromClusterArn(scope: constructs.Construct, id: string, clusterArn: string): ICluster {
    class Import extends ClusterBase {
      public readonly clusterArn = clusterArn;
      public readonly clusterName = core.Fn.select(1, core.Fn.split('/', clusterArn)); // ['arn:partition:kafka:region:account-id', clusterName, clusterId]
    }

    return new Import(scope, id);
  }

  public readonly clusterArn: string;
  public readonly clusterName: string;
  /** Key used to encrypt SASL/SCRAM users */
  public readonly saslScramAuthenticationKey?: kms.IKey;
  private _clusterDescription?: cr.AwsCustomResource;
  private _clusterBootstrapBrokers?: cr.AwsCustomResource;

  constructor(scope: constructs.Construct, id: string, props: ClusterProps) {
    super(scope, id, { physicalName: props.clusterName });
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    const subnetSelection = props.vpc.selectSubnets(props.vpcSubnets);

    this._connections = new ec2.Connections({
      securityGroups: props.securityGroups ?? [
        new ec2.SecurityGroup(this, 'SecurityGroup', {
          description: 'MSK security group',
          vpc: props.vpc,
        }),
      ],
    });

    if (subnetSelection.subnets.length < 2) {
      throw new core.ValidationError(`Cluster requires at least 2 subnets, got ${subnetSelection.subnets.length}`, this);
    }

    if (props.encryptionInTransit?.clientBroker === ClientBrokerEncryption.PLAINTEXT && props.clientAuthentication) {
      throw new core.ValidationError('To enable client authentication, you must enabled TLS-encrypted traffic between clients and brokers.', this);
    } else if (
      props.encryptionInTransit?.clientBroker ===
        ClientBrokerEncryption.TLS_PLAINTEXT &&
      (props.clientAuthentication?.saslProps?.scram ||
        props.clientAuthentication?.saslProps?.iam)
    ) {
      throw new core.ValidationError('To enable SASL/SCRAM or IAM authentication, you must only allow TLS-encrypted traffic between clients and brokers.', this);
    }

    const volumeSize = props.ebsStorageInfo?.volumeSize ?? 1000;
    // Minimum: 1 GiB, maximum: 16384 GiB
    if (volumeSize < 1 || volumeSize > 16384) {
      throw new core.ValidationError('EBS volume size should be in the range 1-16384', this);
    }

    const instanceType = props.instanceType
      ? this.mskInstanceType(props.instanceType)
      : this.mskInstanceType(
        ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE),
      );

    if (props.storageMode && props.storageMode === StorageMode.TIERED) {
      if (!props.kafkaVersion.isTieredStorageCompatible()) {
        throw new core.ValidationError(`To deploy a tiered cluster you must select a compatible Kafka version, got ${props.kafkaVersion.version}`, this);
      }
      if (instanceType === this.mskInstanceType(
        ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      )) {
        throw new core.ValidationError('Tiered storage doesn\'t support broker type t3.small', this);
      }
    }

    const encryptionAtRest = props.ebsStorageInfo?.encryptionKey
      ? {
        dataVolumeKmsKeyId:
            props.ebsStorageInfo.encryptionKey.keyId,
      }
      : undefined; // MSK will create the managed key

    const encryptionInTransit = {
      clientBroker:
        props.encryptionInTransit?.clientBroker ??
        ClientBrokerEncryption.TLS,
      inCluster: props.encryptionInTransit?.enableInCluster ?? true,
    };

    const openMonitoring =
      props.monitoring?.enablePrometheusJmxExporter ||
      props.monitoring?.enablePrometheusNodeExporter
        ? {
          prometheus: {
            jmxExporter: props.monitoring?.enablePrometheusJmxExporter
              ? { enabledInBroker: true }
              : undefined,
            nodeExporter: props.monitoring
              ?.enablePrometheusNodeExporter
              ? { enabledInBroker: true }
              : undefined,
          },
        }
        : undefined;

    const loggingBucket = props.logging?.s3?.bucket;
    if (loggingBucket && FeatureFlags.of(this).isEnabled(S3_CREATE_DEFAULT_LOGGING_POLICY)) {
      const stack = core.Stack.of(this);
      loggingBucket.addToResourcePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [
          new iam.ServicePrincipal('delivery.logs.amazonaws.com'),
        ],
        resources: [
          loggingBucket.arnForObjects(`AWSLogs/${stack.account}/*`),
        ],
        actions: ['s3:PutObject'],
        conditions: {
          StringEquals: {
            's3:x-amz-acl': 'bucket-owner-full-control',
            'aws:SourceAccount': stack.account,
          },
          ArnLike: {
            'aws:SourceArn': stack.formatArn({
              service: 'logs',
              resource: '*',
            }),
          },
        },
      }));

      loggingBucket.addToResourcePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [
          new iam.ServicePrincipal('delivery.logs.amazonaws.com'),
        ],
        resources: [loggingBucket.bucketArn],
        actions: [
          's3:GetBucketAcl',
          's3:ListBucket',
        ],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': stack.account,
          },
          ArnLike: {
            'aws:SourceArn': stack.formatArn({
              service: 'logs',
              resource: '*',
            }),
          },
        },
      }));
    }
    const loggingInfo = {
      brokerLogs: {
        cloudWatchLogs: {
          enabled:
            props.logging?.cloudwatchLogGroup !== undefined,
          logGroup:
            props.logging?.cloudwatchLogGroup?.logGroupName,
        },
        firehose: {
          enabled:
            props.logging?.firehoseDeliveryStreamName !==
            undefined,
          deliveryStream:
            props.logging?.firehoseDeliveryStreamName,
        },
        s3: {
          enabled: loggingBucket !== undefined,
          bucket: loggingBucket?.bucketName,
          prefix: props.logging?.s3?.prefix,
        },
      },
    };

    if (props.clientAuthentication?.saslProps?.scram && props.clientAuthentication?.saslProps?.key === undefined) {
      this.saslScramAuthenticationKey = new kms.Key(this, 'SASLKey', {
        description: 'Used for encrypting MSK secrets for SASL/SCRAM authentication.',
        alias: `msk/${props.clusterName}/sasl/scram`,
      });

      // https://docs.aws.amazon.com/kms/latest/developerguide/services-secrets-manager.html#asm-policies
      this.saslScramAuthenticationKey.addToResourcePolicy(
        new iam.PolicyStatement({
          sid:
            'Allow access through AWS Secrets Manager for all principals in the account that are authorized to use AWS Secrets Manager',
          principals: [new iam.AnyPrincipal()],
          actions: [
            'kms:Encrypt',
            'kms:Decrypt',
            'kms:ReEncrypt*',
            'kms:GenerateDataKey*',
            'kms:CreateGrant',
            'kms:DescribeKey',
          ],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'kms:ViaService': `secretsmanager.${core.Stack.of(this).region}.amazonaws.com`,
              'kms:CallerAccount': core.Stack.of(this).account,
            },
          },
        }),
      );
    }

    let clientAuthentication: CfnCluster.ClientAuthenticationProperty | undefined;
    if (props.clientAuthentication) {
      const { saslProps, tlsProps } = props.clientAuthentication;
      clientAuthentication = {
        sasl: saslProps ? {
          iam: saslProps.iam ? { enabled: true }: undefined,
          scram: saslProps.scram ? { enabled: true }: undefined,
        } : undefined,
        tls: tlsProps?.certificateAuthorities ? {
          certificateAuthorityArnList: tlsProps.certificateAuthorities?.map((ca) => ca.certificateAuthorityArn),
        } : undefined,
      };
    }

    const resource = new CfnCluster(this, 'Resource', {
      clusterName: props.clusterName,
      kafkaVersion: props.kafkaVersion.version,
      numberOfBrokerNodes:
        props.numberOfBrokerNodes !== undefined ?
          subnetSelection.availabilityZones.length * props.numberOfBrokerNodes : subnetSelection.availabilityZones.length,
      brokerNodeGroupInfo: {
        instanceType,
        clientSubnets: subnetSelection.subnetIds,
        securityGroups: this.connections.securityGroups.map(
          (group) => group.securityGroupId,
        ),
        storageInfo: {
          ebsStorageInfo: {
            volumeSize: volumeSize,
          },
        },
      },
      encryptionInfo: {
        encryptionAtRest,
        encryptionInTransit,
      },
      configurationInfo: props.configurationInfo,
      enhancedMonitoring: props.monitoring?.clusterMonitoringLevel,
      openMonitoring: openMonitoring,
      storageMode: props.storageMode,
      loggingInfo: loggingInfo,
      clientAuthentication,
    });

    this.clusterName = this.getResourceNameAttribute(
      core.Fn.select(1, core.Fn.split('/', resource.ref)),
    );
    this.clusterArn = resource.ref;

    resource.applyRemovalPolicy(props.removalPolicy, {
      default: core.RemovalPolicy.RETAIN,
    });
  }

  private mskInstanceType(instanceType: ec2.InstanceType): string {
    return `kafka.${instanceType.toString()}`;
  }

  /**
   * Get the ZooKeeper Connection string
   *
   * Uses a Custom Resource to make an API call to `describeCluster` using the Javascript SDK
   *
   * @param responseField Field to return from API call. eg. ZookeeperConnectString, ZookeeperConnectStringTls
   * @returns - The connection string to use to connect to the Apache ZooKeeper cluster.
   */
  private _zookeeperConnectionString(responseField: string): string {
    if (!this._clusterDescription) {
      this._clusterDescription = new cr.AwsCustomResource(this, 'ZookeeperConnect', {
        onUpdate: {
          service: 'Kafka',
          action: 'describeCluster',
          parameters: {
            ClusterArn: this.clusterArn,
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            'ZooKeeperConnectionString',
          ),
          // Limit the output of describeCluster that is otherwise too large
          outputPaths: [
            'ClusterInfo.ZookeeperConnectString',
            'ClusterInfo.ZookeeperConnectStringTls',
          ],
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: [this.clusterArn],
        }),
        installLatestAwsSdk: false,
      });
    }
    return this._clusterDescription.getResponseField(`ClusterInfo.${responseField}`);
  }

  /**
   * Get the ZooKeeper Connection string
   *
   * Uses a Custom Resource to make an API call to `describeCluster` using the Javascript SDK
   *
   * @returns - The connection string to use to connect to the Apache ZooKeeper cluster.
   */
  public get zookeeperConnectionString(): string {
    return this._zookeeperConnectionString('ZookeeperConnectString');
  }

  /**
   * Get the ZooKeeper Connection string for a TLS enabled cluster
   *
   * Uses a Custom Resource to make an API call to `describeCluster` using the Javascript SDK
   *
   * @returns - The connection string to use to connect to zookeeper cluster on TLS port.
   */
  public get zookeeperConnectionStringTls(): string {
    return this._zookeeperConnectionString('ZookeeperConnectStringTls');
  }

  /**
   * Get the list of brokers that a client application can use to bootstrap
   *
   * Uses a Custom Resource to make an API call to `getBootstrapBrokers` using the Javascript SDK
   *
   * @param responseField Field to return from API call. eg. BootstrapBrokerStringSaslScram, BootstrapBrokerString
   * @returns - A string containing one or more hostname:port pairs.
   */
  private _bootstrapBrokers(responseField: string): string {
    if (!this._clusterBootstrapBrokers) {
      this._clusterBootstrapBrokers = new cr.AwsCustomResource(this, `BootstrapBrokers${responseField}`, {
        onUpdate: {
          service: 'Kafka',
          action: 'getBootstrapBrokers',
          parameters: {
            ClusterArn: this.clusterArn,
          },
          physicalResourceId: cr.PhysicalResourceId.of('BootstrapBrokers'),
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: [this.clusterArn],
        }),
        // APIs are available in 2.1055.0
        installLatestAwsSdk: false,
      });
    }
    return this._clusterBootstrapBrokers.getResponseField(responseField);
  }
  /**
   * Get the list of brokers that a client application can use to bootstrap
   *
   * Uses a Custom Resource to make an API call to `getBootstrapBrokers` using the Javascript SDK
   *
   * @returns - A string containing one or more hostname:port pairs.
   */
  public get bootstrapBrokers(): string {
    return this._bootstrapBrokers('BootstrapBrokerString');
  }

  /**
   * Get the list of brokers that a TLS authenticated client application can use to bootstrap
   *
   * Uses a Custom Resource to make an API call to `getBootstrapBrokers` using the Javascript SDK
   *
   * @returns - A string containing one or more DNS names (or IP) and TLS port pairs.
   */
  public get bootstrapBrokersTls(): string {
    return this._bootstrapBrokers('BootstrapBrokerStringTls');
  }

  /**
   * Get the list of brokers that a SASL/SCRAM authenticated client application can use to bootstrap
   *
   * Uses a Custom Resource to make an API call to `getBootstrapBrokers` using the Javascript SDK
   *
   * @returns - A string containing one or more dns name (or IP) and SASL SCRAM port pairs.
   */
  public get bootstrapBrokersSaslScram(): string {
    return this._bootstrapBrokers('BootstrapBrokerStringSaslScram');
  }

  /**
   * Get the list of brokers that a SASL/IAM authenticated client application can use to bootstrap
   *
   * Uses a Custom Resource to make an API call to `getBootstrapBrokers` using the Javascript SDK
   *
   * @returns - A string containing one or more DNS names (or IP) and TLS port pairs.
   */
  public get bootstrapBrokersSaslIam() {
    return this._bootstrapBrokers('BootstrapBrokerStringSaslIam');
  }

  /**
   * A list of usersnames to register with the cluster. The password will automatically be generated using Secrets
   * Manager and the { username, password } JSON object stored in Secrets Manager as `AmazonMSK_username`.
   *
   * Must be using the SASL/SCRAM authentication mechanism.
   *
   * @param usernames - username(s) to register with the cluster
   */
  @MethodMetadata()
  public addUser(...usernames: string[]): void {
    if (this.saslScramAuthenticationKey) {
      const MSK_SECRET_PREFIX = 'AmazonMSK_'; // Required
      const secrets = usernames.map(
        (username) =>
          new secretsmanager.Secret(this, `KafkaUser${username}`, {
            secretName: `${MSK_SECRET_PREFIX}${this.clusterName}_${username}`,
            generateSecretString: {
              secretStringTemplate: JSON.stringify({ username }),
              generateStringKey: 'password',
            },
            encryptionKey: this.saslScramAuthenticationKey,
          }),
      );

      new cr.AwsCustomResource(this, `BatchAssociateScramSecrets${addressOf(usernames)}`, {
        onUpdate: {
          service: 'Kafka',
          action: 'batchAssociateScramSecret',
          parameters: {
            ClusterArn: this.clusterArn,
            SecretArnList: secrets.map((secret) => secret.secretArn),
          },
          physicalResourceId: cr.PhysicalResourceId.of('CreateUsers'),
        },
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: ['kms:CreateGrant'],
            resources: [this.saslScramAuthenticationKey?.keyArn],
          }),
          new iam.PolicyStatement({
            actions: ['kafka:BatchAssociateScramSecret'],
            resources: [this.clusterArn],
          }),
        ]),
        installLatestAwsSdk: false,
      });
    } else {
      throw new core.ValidationError('Cannot create users if an authentication KMS key has not been created/provided.', this);
    }
  }
}
