export class AuthorizeRequestDto {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  scope: string;
  state?: string;
  nonce?: string;
}

export class TokenRequestDto {
  grant_type: string;
  code: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}
