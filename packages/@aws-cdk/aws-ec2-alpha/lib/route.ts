import { CfnEIP, CfnEgressOnlyInternetGateway, CfnInternetGateway, CfnNatGateway, CfnVPCPeeringConnection, CfnRoute, CfnRouteTable, CfnVPCGatewayAttachment, CfnVPNGateway, CfnVPNGatewayRoutePropagation, GatewayVpcEndpoint, IRouteTable, IVpcEndpoint, RouterType } from 'aws-cdk-lib/aws-ec2';
import { Construct, IDependable } from 'constructs';
import { Annotations, Duration, FeatureFlags, IResource, Resource, Tags, ValidationError } from 'aws-cdk-lib/core';
import { IVpcV2, VPNGatewayV2Options } from './vpc-v2-base';
import { NetworkUtils, allRouteTableIds, CidrBlock } from './util';
import { ISubnetV2 } from './subnet-v2';
import { addConstructMetadata, MethodMetadata } from 'aws-cdk-lib/core/lib/metadata-resource';
import { cx_api } from 'aws-cdk-lib';
import { propertyInjectable } from 'aws-cdk-lib/core/lib/prop-injectable';

/**
 * Indicates whether the NAT gateway supports public or private connectivity.
 * The default is public connectivity.
 * See: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-ec2-natgateway.html#cfn-ec2-natgateway-connectivitytype
 */
export enum NatConnectivityType {
  /**
   * Sets Connectivity type to PUBLIC
   */
  PUBLIC = 'public',
  /**
   * Sets Connectivity type to PRIVATE
   */
  PRIVATE = 'private',
}

/**
 * Interface to define a routing target, such as an
 * egress-only internet gateway or VPC endpoint.
 */
export interface IRouteTarget extends IDependable {
  /**
   * The type of router used in the route.
   */
  readonly routerType: RouterType;

  /**
   * The ID of the route target.
   */
  readonly routerTargetId: string;
}

/**
 * Properties to define an egress-only internet gateway.
 */
export interface EgressOnlyInternetGatewayProps {
  /**
   * The ID of the VPC for which to create the egress-only internet gateway.
   */
  readonly vpc: IVpcV2;

  /**
   * The resource name of the egress-only internet gateway.
   *
   * @default - provisioned without a resource name
   */
  readonly egressOnlyInternetGatewayName?: string;
}

/**
 * Properties to define an internet gateway.
 */
export interface InternetGatewayProps {
  /**
   * The ID of the VPC for which to create the internet gateway.
   */
  readonly vpc: IVpcV2;

  /**
   * The resource name of the internet gateway.
   *
   * @default - provisioned without a resource name
   */
  readonly internetGatewayName?: string;

}

/**
 * Properties to define a VPN gateway.
 */
export interface VPNGatewayV2Props extends VPNGatewayV2Options {

  /**
   * The ID of the VPC for which to create the VPN gateway.
   */
  readonly vpc: IVpcV2;
}

/**
 * Options to define a NAT gateway.
 */
export interface NatGatewayOptions {
  /**
   * The subnet in which the NAT gateway is located.
   */
  readonly subnet: ISubnetV2;

  /**
   * AllocationID of Elastic IP address that's associated with the NAT gateway. This property is required for a public NAT
   * gateway and cannot be specified with a private NAT gateway.
   *
   * @default - attr.allocationID of a new Elastic IP created by default
   * //TODO: ADD L2 for elastic ip
   */
  readonly allocationId?: string;

  /**
   * Indicates whether the NAT gateway supports public or private connectivity.
   *
   * @default NatConnectivityType.Public
   */
  readonly connectivityType?: NatConnectivityType;

  /**
   * The maximum amount of time to wait before forcibly releasing the
   * IP addresses if connections are still in progress.
   *
   * @default 350seconds
   */
  readonly maxDrainDuration?: Duration;

  /**
   * The private IPv4 address to assign to the NAT gateway.
   *
   * @default - If you don't provide an address, a private IPv4 address will be automatically assigned.
   */
  readonly privateIpAddress?: string;

  /**
   * Secondary EIP allocation IDs.
   * @see https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html#nat-gateway-creating
   *
   * @default - no secondary allocation IDs attached to NATGW
   *
   */
  readonly secondaryAllocationIds?: string[];

  /**
   * The number of secondary private IPv4 addresses you
   * want to assign to the NAT gateway.
   *
   * `SecondaryPrivateIpAddressCount` and `SecondaryPrivateIpAddresses` cannot be
   * set at the same time.
   * @see https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html#nat-gateway-creating
   *
   * @default - no secondary allocation IDs associated with NATGW
   */
  readonly secondaryPrivateIpAddressCount?: number;

  /**
   * Secondary private IPv4 addresses.
   *
   * `SecondaryPrivateIpAddressCount` and `SecondaryPrivateIpAddresses` cannot be
   * set at the same time.
   * @see https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html#nat-gateway-creating
   *
   * @default - no secondary private IpAddresses associated with NATGW
   */
  readonly secondaryPrivateIpAddresses?: string[];

  /**
   * The resource name of the NAT gateway.
   *
   * @default - NATGW provisioned without any name
   */
  readonly natGatewayName?: string;
}

/**
 * Properties to define a NAT gateway.
 */
export interface NatGatewayProps extends NatGatewayOptions {
  /**
   * The ID of the VPC in which the NAT gateway is located.
   *
   * @default - no elastic ip associated, required in case of public connectivity if `AllocationId` is not defined
   */
  readonly vpc?: IVpcV2;
}

/**
 * Options to define a VPC peering connection.
 */
export interface VPCPeeringConnectionOptions {
  /**
   * The VPC that is accepting the peering connection.
   */
  readonly acceptorVpc: IVpcV2;

  /**
   * The role arn created in the acceptor account.
   *
   * @default - no peerRoleArn needed if not cross account connection
   */
  readonly peerRoleArn?: string;

  /**
   * The resource name of the peering connection.
   *
   * @default - peering connection provisioned without any name
   */
  readonly vpcPeeringConnectionName?: string;
}

/**
 * Properties to define a VPC peering connection.
 */
export interface VPCPeeringConnectionProps extends VPCPeeringConnectionOptions {
  /**
   * The VPC that is requesting the peering connection.
   */
  readonly requestorVpc: IVpcV2;
}

/**
 * Name tag constant
 */
const NAME_TAG: string = 'Name';

/**
 * Creates an egress-only internet gateway
 * @resource AWS::EC2::EgressOnlyInternetGateway
 */
@propertyInjectable
export class EgressOnlyInternetGateway extends Resource implements IRouteTarget {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = '@aws-cdk.aws-ec2-alpha.EgressOnlyInternetGateway';
  /**
   * The type of router used in the route.
   */
  readonly routerType: RouterType;

  /**
   * The ID of the route target.
   */
  readonly routerTargetId: string;

  /**
   * The egress-only internet gateway CFN resource.
   */
  public readonly resource: CfnEgressOnlyInternetGateway;

  constructor(scope: Construct, id: string, props: EgressOnlyInternetGatewayProps) {
    super(scope, id);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    if (props.egressOnlyInternetGatewayName) {
      Tags.of(this).add(NAME_TAG, props.egressOnlyInternetGatewayName);
    }
    this.routerType = RouterType.EGRESS_ONLY_INTERNET_GATEWAY;

    this.resource = new CfnEgressOnlyInternetGateway(this, 'EIGW', {
      vpcId: props.vpc.vpcId,
    });
    this.node.defaultChild = this.resource;

    this.routerTargetId = this.resource.attrId;
  }
}

/**
 * Creates an internet gateway
 * @resource AWS::EC2::InternetGateway
 */
@propertyInjectable
export class InternetGateway extends Resource implements IRouteTarget {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = '@aws-cdk.aws-ec2-alpha.InternetGateway';
  /**
   * The type of router used in the route.
   */
  readonly routerType: RouterType;

  /**
   * The ID of the route target.
   */
  readonly routerTargetId: string;

  /**
   * The ID of the VPC for which to create the internet gateway.
   */
  public readonly vpcId: string;

  /**
   * The internet gateway CFN resource.
   */
  public readonly resource: CfnInternetGateway;

  constructor(scope: Construct, id: string, props: InternetGatewayProps) {
    super(scope, id);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    this.routerType = RouterType.GATEWAY;

    this.resource = new CfnInternetGateway(this, 'IGW', {});
    this.node.defaultChild = this.resource;

    this.routerTargetId = FeatureFlags.of(this).isEnabled(cx_api.USE_RESOURCEID_FOR_VPCV2_MIGRATION) ?
      this.resource.ref : this.resource.attrInternetGatewayId;
    this.vpcId = props.vpc.vpcId;

    if (props.internetGatewayName) {
      Tags.of(this).add(NAME_TAG, props.internetGatewayName);
    }

    if (props.vpc.vpcName) {
      Tags.of(this).add('Name', props.vpc.vpcName);
    }

    new CfnVPCGatewayAttachment(this, 'GWAttachment', {
      vpcId: this.vpcId,
      internetGatewayId: this.routerTargetId,
    });
  }
}

/**
 * Creates a virtual private gateway
 * @resource AWS::EC2::VPNGateway
 */
@propertyInjectable
export class VPNGatewayV2 extends Resource implements IRouteTarget {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = '@aws-cdk.aws-ec2-alpha.VPNGatewayV2';
  /**
   * The type of router used in the route.
   */
  readonly routerType: RouterType;

  /**
   * The ID of the route target.
   */
  readonly routerTargetId: string;

  /**
   * The ID of the VPC for which to create the VPN gateway.
   */
  public readonly vpcId: string;

  /**
   * The VPN gateway CFN resource.
   */
  public readonly resource: CfnVPNGateway;

  /**
   * The VPN Gateway Attachment
   */
  private readonly _attachment: CfnVPCGatewayAttachment;

  /**
   * The VPN Gateway Route Propagation
   */
  private readonly _routePropagation: CfnVPNGatewayRoutePropagation;

  constructor(scope: Construct, id: string, props: VPNGatewayV2Props) {
    super(scope, id, {
      physicalName: props.vpnGatewayName,
    });
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    this.routerType = RouterType.GATEWAY;

    this.resource = new CfnVPNGateway(this, 'IGW', {
      type: props.type,
      amazonSideAsn: props.amazonSideAsn,
    });
    this.node.defaultChild = this.resource;

    this.routerTargetId = this.resource.attrVpnGatewayId;

    this.vpcId = props.vpc.vpcId;
    this._attachment = new CfnVPCGatewayAttachment(this, 'VPCVPNGW', {
      vpcId: this.vpcId,
      vpnGatewayId: this.resource.attrVpnGatewayId,
    });

    if (props.vpnGatewayName) {
      Tags.of(this).add(NAME_TAG, props.vpnGatewayName);
    }

    // Propagate routes on route tables associated with the right subnets
    const vpnRoutePropagation = props.vpnRoutePropagation ?? [];
    const subnets = vpnRoutePropagation.map(s => props.vpc.selectSubnets(s).subnets).flat();
    const routeTableIds = allRouteTableIds(subnets);

    if (routeTableIds.length === 0) {
      Annotations.of(scope).addWarningV2('@aws-cdk:aws-ec2-elpha:enableVpnGatewayV2', `No subnets matching selection: '${JSON.stringify(vpnRoutePropagation)}'. Select other subnets to add routes to.`);
    }

    this._routePropagation = new CfnVPNGatewayRoutePropagation(this, 'RoutePropagation', {
      routeTableIds,
      vpnGatewayId: this.routerTargetId,
    });
    // The AWS::EC2::VPNGatewayRoutePropagation resource cannot use the VPN gateway
    // until it has successfully attached to the VPC.
    // See https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-ec2-vpn-gatewayrouteprop.html
    this._routePropagation.node.addDependency(this._attachment);
  }
}

/**
 * Creates a network address translation (NAT) gateway
 * @resource AWS::EC2::NatGateway
 */
@propertyInjectable
export class NatGateway extends Resource implements IRouteTarget {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = '@aws-cdk.aws-ec2-alpha.NatGateway';
  /**
   * Id of the NatGateway
   * @attribute
   */
  public readonly natGatewayId: string;

  /**
   * The type of router used in the route.
   */
  public readonly routerType: RouterType;

  /**
   * The ID of the route target.
   */
  public readonly routerTargetId: string;

  /**
   * Indicates whether the NAT gateway supports public or private connectivity.
   *
   * @default public
   */
  public readonly connectivityType?: NatConnectivityType;

  /**
   * The maximum amount of time to wait before forcibly releasing the
   * IP addresses if connections are still in progress.
   *
   * @default '350 seconds'
   */
  public readonly maxDrainDuration?: Duration;

  /**
   * The NAT gateway CFN resource.
   */
  public readonly resource: CfnNatGateway;

  /**
   * Elastic IP created for allocation
   */
  public readonly eip?: CfnEIP;

  constructor(scope: Construct, id: string, props: NatGatewayProps) {
    super(scope, id);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    this.routerType = RouterType.NAT_GATEWAY;

    this.connectivityType = props.connectivityType || NatConnectivityType.PUBLIC;
    this.maxDrainDuration = props.maxDrainDuration || Duration.seconds(350);

    if (this.connectivityType === NatConnectivityType.PUBLIC) {
      if (!props.vpc && !props.allocationId) {
        throw new ValidationError('Either provide vpc or allocationId', this);
      }
    }

    if (props.natGatewayName) {
      Tags.of(this).add(NAME_TAG, props?.natGatewayName);
    }

    // If user does not provide EIP, generate one for them
    var aId: string | undefined;
    if (this.connectivityType === NatConnectivityType.PUBLIC) {
      if (!props.allocationId) {
        this.eip = new CfnEIP(this, 'EIP', {
          domain: 'vpc',
        });
        aId = this.eip.attrAllocationId;
      } else {
        aId = props.allocationId;
      }
    }

    this.resource = new CfnNatGateway(this, 'NATGateway', {
      subnetId: props.subnet.subnetId,
      allocationId: aId,
      maxDrainDurationSeconds: props.maxDrainDuration?.toSeconds(),
      secondaryAllocationIds: props.secondaryAllocationIds,
      ...props,
    });
    this.natGatewayId = FeatureFlags.of(this).isEnabled(cx_api.USE_RESOURCEID_FOR_VPCV2_MIGRATION) ?
      this.resource.ref : this.resource.attrNatGatewayId;

    this.routerTargetId = FeatureFlags.of(this).isEnabled(cx_api.USE_RESOURCEID_FOR_VPCV2_MIGRATION) ?
      this.resource.ref : this.resource.attrNatGatewayId;

    this.node.defaultChild = this.resource;
    this.resource.node.addDependency(props.subnet.internetConnectivityEstablished);
  }
}

/**
 * Creates a peering connection between two VPCs
 * @resource AWS::EC2::VPCPeeringConnection
 */
@propertyInjectable
export class VPCPeeringConnection extends Resource implements IRouteTarget {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = '@aws-cdk.aws-ec2-alpha.VPCPeeringConnection';
  /**
   * The type of router used in the route.
   */
  readonly routerType: RouterType;

  /**
   * The ID of the route target.
   */
  readonly routerTargetId: string;

  /**
   * The VPC peering connection CFN resource.
   */
  public readonly resource: CfnVPCPeeringConnection;

  constructor(scope: Construct, id: string, props: VPCPeeringConnectionProps) {
    super(scope, id);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    this.routerType = RouterType.VPC_PEERING_CONNECTION;

    const isCrossAccount = props.requestorVpc.ownerAccountId !== props.acceptorVpc.ownerAccountId;

    if (!isCrossAccount && props.peerRoleArn) {
      throw new ValidationError('peerRoleArn is not needed for same account peering', this);
    }

    if (isCrossAccount && !props.peerRoleArn) {
      throw new ValidationError('Cross account VPC peering requires peerRoleArn', this);
    }

    const overlap = this.validateVpcCidrOverlap(props.requestorVpc, props.acceptorVpc);
    if (overlap) {
      throw new ValidationError('CIDR block should not overlap with each other for establishing a peering connection', this);
    }
    if (props.vpcPeeringConnectionName) {
      Tags.of(this).add(NAME_TAG, props.vpcPeeringConnectionName);
    }

    this.resource = new CfnVPCPeeringConnection(this, 'VPCPeeringConnection', {
      vpcId: props.requestorVpc.vpcId,
      peerVpcId: props.acceptorVpc.vpcId,
      peerOwnerId: props.acceptorVpc.ownerAccountId,
      peerRegion: props.acceptorVpc.region,
      peerRoleArn: isCrossAccount ? props.peerRoleArn : undefined,
    });

    this.routerTargetId = this.resource.attrId;
    this.node.defaultChild = this.resource;
  }

  /**
   * Validates if the provided IPv4 CIDR block overlaps with existing subnet CIDR blocks within the given VPC.
   *
   * @param requestorVpc The VPC of the requestor.
   * @param acceptorVpc The VPC of the acceptor.
   * @returns True if the IPv4 CIDR block overlaps with each other for two VPCs, false otherwise.
   * @internal
   */
  private validateVpcCidrOverlap(requestorVpc: IVpcV2, acceptorVpc: IVpcV2): boolean {
    const requestorCidrs = [requestorVpc.ipv4CidrBlock];
    const acceptorCidrs = [acceptorVpc.ipv4CidrBlock];

    if (requestorVpc.secondaryCidrBlock) {
      requestorCidrs.push(...requestorVpc.secondaryCidrBlock
        .map(block => block.cidrBlock)
        .filter((cidr): cidr is string => cidr !== undefined));
    }

    if (acceptorVpc.secondaryCidrBlock) {
      acceptorCidrs.push(...acceptorVpc.secondaryCidrBlock
        .map(block => block.cidrBlock)
        .filter((cidr): cidr is string => cidr !== undefined));
    }

    for (const requestorCidr of requestorCidrs) {
      const requestorRange = new CidrBlock(requestorCidr);
      const requestorIpRange: [string, string] = [requestorRange.minIp(), requestorRange.maxIp()];

      for (const acceptorCidr of acceptorCidrs) {
        const acceptorRange = new CidrBlock(acceptorCidr);
        const acceptorIpRange: [string, string] = [acceptorRange.minIp(), acceptorRange.maxIp()];

        if (requestorRange.rangesOverlap(acceptorIpRange, requestorIpRange)) {
          return true;
        }
      }
    }

    return false;
  }
}

/**
 * The type of endpoint or gateway being targeted by the route.
 */
export interface RouteTargetProps {
  /**
   * The gateway route target. This is used for targets such as
   * egress-only internet gateway or VPC peering connection.
   *
   * @default - target is not set to a gateway, in this case an endpoint is needed.
   */
  readonly gateway?: IRouteTarget;

  /**
   * The endpoint route target. This is used for targets such as
   * VPC endpoints.
   *
   * @default - target is not set to an endpoint, in this case a gateway is needed.
   */
  readonly endpoint?: IVpcEndpoint;
}

/**
 * The gateway or endpoint targeted by the route.
 */
export class RouteTargetType {
  /**
   * The gateway route target. This is used for targets such as
   * egress-only internet gateway or VPC peering connection.
   *
   * @default - target is not set to a gateway, in this case an endpoint is needed.
   */
  readonly gateway?: IRouteTarget;

  /**
   * The endpoint route target. This is used for targets such as
   * VPC endpoints.
   *
   * @default - target is not set to an endpoint, in this case a gateway is needed.
   */
  readonly endpoint?: IVpcEndpoint;

  constructor(props: RouteTargetProps) {
    this.gateway = props.gateway;
    this.endpoint = props.endpoint;
  }
}

/**
 * Interface to define a route.
 */
export interface IRouteV2 extends IResource {
  /**
   * The ID of the route table for the route.
   * @attribute routeTable
   */
  readonly routeTable: IRouteTable;

  /**
   * The IPv4 or IPv6 CIDR block used for the destination match.
   *
   * Routing decisions are based on the most specific match.
   * TODO: Look for strong IP type implementation here.
   */
  readonly destination: string;

  /**
   * The gateway or endpoint targeted by the route.
   */
  readonly target: RouteTargetType;
}

/**
 * Properties to define a route.
 */
export interface RouteProps {
  /**
   * The ID of the route table for the route.
   *
   * @attribute routeTable
   */
  readonly routeTable: IRouteTable;

  /**
   * The IPv4 or IPv6 CIDR block used for the destination match.
   *
   * Routing decisions are based on the most specific match.
   */
  readonly destination: string;

  /**
   * The gateway or endpoint targeted by the route.
   */
  readonly target: RouteTargetType;

  /**
   * The resource name of the route.
   *
   * @default - provisioned without a route name
   */
  readonly routeName?: string;
}

/**
 * Creates a new route with added functionality.
 * @resource AWS::EC2::Route
 */
@propertyInjectable
export class Route extends Resource implements IRouteV2 {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = '@aws-cdk.aws-ec2-alpha.Route';
  /**
   * The IPv4 or IPv6 CIDR block used for the destination match.
   *
   * Routing decisions are based on the most specific match.
   */
  public readonly destination: string;

  /**
   * The gateway or endpoint targeted by the route.
   */
  public readonly target: RouteTargetType;

  /**
   * The route table for the route.
   * @attribute routeTable
   */
  public readonly routeTable: IRouteTable;

  /**
   * The type of router the route is targeting
   */
  public readonly targetRouterType: RouterType;

  /**
   * The route CFN resource.
   */
  public readonly resource?: CfnRoute;

  /**
   * Destination cidr block for ipv6
   */
  private destinationIpv6Cidr?: string;

  /**
   * Destination cidr block for ipv4
   */
  private destinationIpv4Cidr?: string;

  constructor(scope: Construct, id: string, props: RouteProps) {
    super(scope, id);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    this.target = props.target;
    this.routeTable = props.routeTable;
    this.destination = props.destination;
    const isDestinationIpv4 = NetworkUtils.validIp(props.destination);
    if (!isDestinationIpv4) {
      // TODO Validate for IPv6 CIDR range
      this.destinationIpv6Cidr = props.destination;
    } else {
      this.destinationIpv4Cidr = props.destination;
    }

    if (this.target.gateway?.routerType === RouterType.EGRESS_ONLY_INTERNET_GATEWAY && isDestinationIpv4) {
      throw new ValidationError('Egress only internet gateway does not support IPv4 routing', this);
    }

    if ((props.target.gateway && props.target.endpoint) || (!props.target.gateway && !props.target.endpoint)) {
      throw new ValidationError('Exactly one of `gateway` or `endpoint` must be specified.', this);
    }
    this.targetRouterType = this.target.gateway ? this.target.gateway.routerType : RouterType.VPC_ENDPOINT;
    // Gateway generates route automatically via its RouteTable, thus we don't need to generate the resource for it
    if (!(this.target.endpoint instanceof GatewayVpcEndpoint)) {
      this.resource = new CfnRoute(this, 'Route', {
        routeTableId: this.routeTable.routeTableId,
        destinationCidrBlock: this.destinationIpv4Cidr,
        destinationIpv6CidrBlock: this.destinationIpv6Cidr,
        [routerTypeToPropName(this.targetRouterType)]: this.target.gateway ? this.target.gateway.routerTargetId :
          this.target.endpoint ? this.target.endpoint.vpcEndpointId : null,
      });
    }
    this.node.defaultChild = this.resource;

    // Create a route only after target gateway or endpoint is created
    if (this.target.gateway) {
      this.node.addDependency(this.target.gateway);
    }
    if (this.target.endpoint) {
      this.node.addDependency(this.target.endpoint);
    }
  }
}

/**
 * Properties to define a route table.
 */
export interface RouteTableProps {
  /**
   * The ID of the VPC.
   */
  readonly vpc: IVpcV2;

  /**
   * The resource name of the route table.
   *
   * @default - provisioned without a route table name
   */
  readonly routeTableName?: string;
}

/**
 * Creates a route table for the specified VPC
 * @resource AWS::EC2::RouteTable
 */
@propertyInjectable
export class RouteTable extends Resource implements IRouteTable {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = '@aws-cdk.aws-ec2-alpha.RouteTable';
  /**
   * The ID of the route table.
   */
  public readonly routeTableId: string;

  /**
   * The route table CFN resource.
   */
  public readonly resource: CfnRouteTable;

  constructor(scope: Construct, id: string, props: RouteTableProps) {
    super(scope, id);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    this.resource = new CfnRouteTable(this, 'RouteTable', {
      vpcId: props.vpc.vpcId,
    });
    if (props.routeTableName) {
      Tags.of(this).add(NAME_TAG, props.routeTableName);
    }
    this.node.defaultChild = this.resource;

    this.routeTableId = FeatureFlags.of(this).isEnabled(cx_api.USE_RESOURCEID_FOR_VPCV2_MIGRATION) ?
      this.resource.ref : this.resource.attrRouteTableId;
  }

  /**
   * Adds a new custom route to the route table.
   *
   * @param destination The IPv4 or IPv6 CIDR block used for the destination match.
   * @param target The gateway or endpoint targeted by the route.
   * @param routeName The resource name of the route.
   */
  @MethodMetadata()
  public addRoute(id: string, destination: string, target: RouteTargetType, routeName?: string) {
    new Route(this, id, {
      routeTable: this,
      destination: destination,
      target: target,
      routeName: routeName,
    });
  }
}

function routerTypeToPropName(routerType: RouterType) {
  return ({
    [RouterType.CARRIER_GATEWAY]: 'carrierGatewayId',
    [RouterType.EGRESS_ONLY_INTERNET_GATEWAY]: 'egressOnlyInternetGatewayId',
    [RouterType.GATEWAY]: 'gatewayId',
    [RouterType.INSTANCE]: 'instanceId',
    [RouterType.LOCAL_GATEWAY]: 'localGatewayId',
    [RouterType.NAT_GATEWAY]: 'natGatewayId',
    [RouterType.NETWORK_INTERFACE]: 'networkInterfaceId',
    [RouterType.TRANSIT_GATEWAY]: 'transitGatewayId',
    [RouterType.VPC_PEERING_CONNECTION]: 'vpcPeeringConnectionId',
    [RouterType.VPC_ENDPOINT]: 'vpcEndpointId',
  })[routerType];
}
